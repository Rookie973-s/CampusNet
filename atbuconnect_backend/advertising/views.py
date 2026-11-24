from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.entitlements import get_entitlements, is_admin_or_mod
from config.security import hash_ip, is_probable_bot
from notifications.models import Notification
from notifications.services import notify

from .models import AdClick, AdImpression, Campaign, PaymentTransaction
from .payments import VERIFICATION_FEE_NGN, calculate_ad_price, get_payment_gateway
from .serializers import CampaignSerializer, ServedAdSerializer


class CampaignViewSet(viewsets.ModelViewSet):
    """
    GET/POST   /api/ads/                      — user's own campaigns (or all if admin & ?all=1)
    GET/PATCH  /api/ads/{id}/                 — campaign details / edit while draft/pending/paused
    POST       /api/ads/{id}/pause/           — advertiser or admin pauses active campaign
    POST       /api/ads/{id}/resume/          — advertiser resumes paused campaign (if approved)
    POST       /api/ads/{id}/approve/         — admin only: approve (becomes active or scheduled)
    POST       /api/ads/{id}/reject/          — admin only: reject with reason
    POST       /api/ads/{id}/initiate-payment/— returns deferred Payment Coming Soon response
    GET        /api/ads/analytics/?range=30d  — advertiser's real metrics + daily time series
    GET        /api/ads/serve/?placement=feed — returns eligible active ads (empty if user hides ads)
    POST       /api/ads/{id}/impression/      — record deduplicated impression
    POST       /api/ads/{id}/click/           — record deduplicated click
    """

    serializer_class = CampaignSerializer
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    throttle_classes = [ScopedRateThrottle]

    def get_permissions(self):
        if self.action in ("serve", "impression", "click"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_throttles(self):
        if self.action in ("impression", "click"):
            self.throttle_scope = "ad_tracking"
            return [ScopedRateThrottle()]
        return []

    def get_queryset(self):
        qs = Campaign.objects.select_related("advertiser", "reviewed_by").annotate(
            n_impressions=Count("impressions", distinct=True),
            n_clicks=Count("clicks", distinct=True),
        )
        u = self.request.user
        if self.action in ("serve", "impression", "click"):
            return qs
        if is_admin_or_mod(u) and (
            self.request.query_params.get("all") == "1"
            or self.action in ("approve", "reject", "retrieve", "pause")
        ):
            status_f = self.request.query_params.get("status")
            if status_f in dict(Campaign.Status.choices):
                qs = qs.filter(status=status_f)
            return qs
        return qs.filter(advertiser=u)

    def perform_create(self, serializer):
        # Never treat submitted ad as paid or approved; allow draft or pending review only.
        raw_status = (self.request.data.get("save_as") or "pending").lower()
        initial_status = Campaign.Status.DRAFT if raw_status == "draft" else Campaign.Status.PENDING
        serializer.save(
            advertiser=self.request.user,
            status=initial_status,
            payment_status=Campaign.PaymentStatus.COMING_SOON,
        )

    def partial_update(self, request, *args, **kwargs):
        camp = self.get_object()
        if camp.advertiser_id != request.user.pk and not is_admin_or_mod(request.user):
            return Response({"detail": "Not authorized."}, status=403)
        if camp.status in (Campaign.Status.ACTIVE, Campaign.Status.COMPLETED) and not is_admin_or_mod(request.user):
            return Response({"detail": "Pause this campaign before editing it."}, status=400)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        camp = self.get_object()
        if camp.advertiser_id != request.user.pk:
            return Response({"detail": "Not authorized."}, status=403)
        if camp.status not in (Campaign.Status.DRAFT, Campaign.Status.REJECTED):
            return Response({"detail": "Campaign is already submitted."}, status=400)
        camp.status = Campaign.Status.PENDING
        camp.save(update_fields=["status", "updated_at"])
        return Response(CampaignSerializer(camp, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        camp = self.get_object()
        if camp.advertiser_id != request.user.pk and not is_admin_or_mod(request.user):
            return Response({"detail": "Not authorized."}, status=403)
        if camp.status not in (Campaign.Status.ACTIVE, Campaign.Status.SCHEDULED, Campaign.Status.APPROVED):
            return Response({"detail": "Only active or scheduled campaigns can be paused."}, status=400)
        camp.status = Campaign.Status.PAUSED
        camp.save(update_fields=["status", "updated_at"])
        return Response(CampaignSerializer(camp, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        camp = self.get_object()
        if camp.advertiser_id != request.user.pk and not is_admin_or_mod(request.user):
            return Response({"detail": "Not authorized."}, status=403)
        if camp.status != Campaign.Status.PAUSED:
            return Response({"detail": "Only paused campaigns can be resumed."}, status=400)
        if not camp.reviewed_by_id:
            return Response({"detail": "Campaign must be approved by an administrator first."}, status=400)
        today = timezone.localdate()
        if today > camp.end_date:
            camp.status = Campaign.Status.COMPLETED
        elif today < camp.start_date:
            camp.status = Campaign.Status.SCHEDULED
        else:
            camp.status = Campaign.Status.ACTIVE
        camp.save(update_fields=["status", "updated_at"])
        return Response(CampaignSerializer(camp, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not is_admin_or_mod(request.user):
            return Response({"detail": "Only administrators can approve campaigns."}, status=403)
        camp = self.get_object()
        today = timezone.localdate()
        if today > camp.end_date:
            next_status = Campaign.Status.COMPLETED
        elif today < camp.start_date:
            next_status = Campaign.Status.SCHEDULED
        else:
            next_status = Campaign.Status.ACTIVE
        camp.status = next_status
        camp.reviewed_by = request.user
        camp.reviewed_at = timezone.now()
        camp.review_note = (request.data.get("note") or "").strip()
        camp.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
        notify(
            camp.advertiser,
            notif_type=Notification.Type.SYSTEM,
            text=f"Your ad campaign '{camp.name}' has been approved ({next_status}).",
            actor=request.user,
            link="/ads",
        )
        return Response(CampaignSerializer(camp, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not is_admin_or_mod(request.user):
            return Response({"detail": "Only administrators can reject campaigns."}, status=403)
        camp = self.get_object()
        note = (request.data.get("note") or request.data.get("reason") or "").strip()
        if not note:
            return Response({"detail": "Please provide a rejection reason."}, status=400)
        camp.status = Campaign.Status.REJECTED
        camp.reviewed_by = request.user
        camp.reviewed_at = timezone.now()
        camp.review_note = note
        camp.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
        notify(
            camp.advertiser,
            notif_type=Notification.Type.SYSTEM,
            text=f"Your ad campaign '{camp.name}' was not approved: {note[:120]}",
            actor=request.user,
            link="/ads",
        )
        return Response(CampaignSerializer(camp, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="estimate")
    def estimate(self, request):
        """Calculate dynamic ad price based on schedule, audience, and placements (capped at NGN 4,000)."""
        from datetime import date as _date
        try:
            sd = _date.fromisoformat(str(request.data.get("start_date") or ""))
            ed = _date.fromisoformat(str(request.data.get("end_date") or ""))
        except Exception:
            sd = timezone.localdate()
            ed = sd + timedelta(days=6)
        est = calculate_ad_price(
            sd, ed,
            targeting=request.data.get("targeting") or {},
            placements=request.data.get("placements") or ["feed"],
        )
        return Response(est)

    @action(detail=True, methods=["post"], url_path="initiate-payment")
    def initiate_payment(self, request, pk=None):
        camp = self.get_object()
        if camp.advertiser_id != request.user.pk and not is_admin_or_mod(request.user):
            return Response({"detail": "Not authorized."}, status=403)
        gw = get_payment_gateway()
        res = gw.initiate_payment(
            user=request.user,
            amount_ngn=camp.total_budget,
            purpose=PaymentTransaction.Purpose.AD_CAMPAIGN,
            campaign=camp,
        )
        return Response({
            "enabled": res.enabled,
            "status": res.status,
            "message": res.message,
            "amount_ngn": res.amount_ngn,
            "reference": res.reference,
            "bank_name": res.bank_name,
            "account_number": res.account_number,
            "account_name": res.account_name,
            "checkout_url": res.checkout_url,
        })

    @action(detail=False, methods=["get"])
    def analytics(self, request):
        """Real analytics for the signed-in advertiser (or platform-wide for admins with ?all=1)."""
        u = request.user
        scope_all = is_admin_or_mod(u) and request.query_params.get("all") == "1"
        camps = Campaign.objects.all() if scope_all else Campaign.objects.filter(advertiser=u)

        campaign_id = request.query_params.get("campaign_id")
        if campaign_id and str(campaign_id).isdigit():
            camps = camps.filter(pk=int(campaign_id))

        rng = (request.query_params.get("range") or "30d").lower()
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(rng, 30)
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))

        camp_ids = list(camps.values_list("id", flat=True))
        imp_rows = (
            AdImpression.objects.filter(campaign_id__in=camp_ids, created_at__gte=since)
            .annotate(d=TruncDate("created_at"))
            .values("d")
            .annotate(n=Count("id"))
        )
        clk_rows = (
            AdClick.objects.filter(campaign_id__in=camp_ids, created_at__gte=since)
            .annotate(d=TruncDate("created_at"))
            .values("d")
            .annotate(n=Count("id"))
        )
        imp_map = {r["d"]: r["n"] for r in imp_rows}
        clk_map = {r["d"]: r["n"] for r in clk_rows}

        total_budget = sum((c.total_budget for c in camps), Decimal("0.00"))
        total_spent = sum((c.amount_spent for c in camps), Decimal("0.00"))
        total_impressions = AdImpression.objects.filter(campaign_id__in=camp_ids).count()
        total_clicks = AdClick.objects.filter(campaign_id__in=camp_ids).count()
        ctr = round((total_clicks / total_impressions) * 100, 2) if total_impressions else 0.0

        daily = []
        for i in range(days):
            d = start + timedelta(days=i)
            day_impr = imp_map.get(d, 0)
            day_clk = clk_map.get(d, 0)
            # Determine status for this day across selected campaigns
            any_active = any(c.status == Campaign.Status.ACTIVE and c.start_date <= d <= c.end_date for c in camps)
            any_paused = any(c.status == Campaign.Status.PAUSED and c.start_date <= d <= c.end_date for c in camps)
            any_sched = any(c.status == Campaign.Status.SCHEDULED and c.start_date <= d <= c.end_date for c in camps)
            any_done = any(c.status == Campaign.Status.COMPLETED and c.start_date <= d <= c.end_date for c in camps)
            day_status = (
                "active" if any_active else
                "paused" if any_paused else
                "scheduled" if any_sched else
                "completed" if any_done else "idle"
            )
            daily.append({
                "date": d.isoformat(),
                "impressions": day_impr,
                "clicks": day_clk,
                "status": day_status,
            })

        return Response({
            "range": rng,
            "currency": "NGN",
            "summary": {
                "total_campaigns": len(camp_ids),
                "active_campaigns": camps.filter(status=Campaign.Status.ACTIVE).count(),
                "total_budget": str(total_budget),
                "amount_spent": str(total_spent),
                "remaining_budget": str(max(Decimal("0.00"), total_budget - total_spent)),
                "total_impressions": total_impressions,
                "total_clicks": total_clicks,
                "ctr": ctr,
            },
            "daily": daily,
            "pricing_configured": bool(getattr(settings, "AD_CPC_RATE", None) or getattr(settings, "AD_CPM_RATE", None)),
        })

    @action(detail=False, methods=["get"])
    def serve(self, request):
        """Return currently eligible active campaigns for feed/comment placement.

        Respects verified students' ad-free preference!
        """
        u = request.user
        if u and u.is_authenticated and get_entitlements(u)["hide_ads"]:
            return Response([])

        placement = (request.query_params.get("placement") or "feed").strip().lower()
        today = timezone.localdate()
        qs = Campaign.objects.filter(
            status=Campaign.Status.ACTIVE,
            start_date__lte=today,
            end_date__gte=today,
        ).order_by("-created_at")

        eligible = []
        fallback = []
        for c in qs:
            if not c.is_eligible_to_serve(today):
                continue
            pl = [str(p).lower() for p in (c.placements or [])]
            if not pl or placement in pl or "all" in pl:
                eligible.append(c)
            elif placement == "library" and "feed" in pl:
                fallback.append(c)
            if len(eligible) >= 5:
                break
        if not eligible and fallback:
            eligible = fallback[:3]

        return Response(ServedAdSerializer(eligible, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def impression(self, request, pk=None):
        if is_probable_bot(request):
            return Response({"recorded": False})
        camp = self.get_object()
        if not camp.is_eligible_to_serve():
            return Response({"recorded": False})
        ip_h = hash_ip(request)
        u = request.user if request.user.is_authenticated else None
        since = timezone.now() - timedelta(minutes=30)
        dup = AdImpression.objects.filter(campaign=camp, created_at__gte=since)
        dup = dup.filter(user=u) if u else dup.filter(ip_hash=ip_h)
        if dup.exists():
            return Response({"recorded": False, "deduplicated": True})
        placement = (request.data.get("placement") or "feed")[:32]
        AdImpression.objects.create(campaign=camp, user=u, ip_hash=ip_h, placement=placement)
        return Response({"recorded": True}, status=201)

    @action(detail=True, methods=["post"])
    def click(self, request, pk=None):
        if is_probable_bot(request):
            return Response({"recorded": False})
        camp = self.get_object()
        if not camp.is_eligible_to_serve():
            return Response({"recorded": False})
        ip_h = hash_ip(request)
        u = request.user if request.user.is_authenticated else None
        since = timezone.now() - timedelta(minutes=5)
        dup = AdClick.objects.filter(campaign=camp, created_at__gte=since)
        dup = dup.filter(user=u) if u else dup.filter(ip_hash=ip_h)
        if dup.exists():
            return Response({"recorded": False, "deduplicated": True})
        placement = (request.data.get("placement") or "feed")[:32]
        AdClick.objects.create(campaign=camp, user=u, ip_hash=ip_h, placement=placement)
        return Response({"recorded": True}, status=201)


from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView


@method_decorator(csrf_exempt, name="dispatch")
class PaystackWebhookView(APIView):
    """POST /api/payments/paystack/webhook/ — HMAC-SHA512 verified Paystack webhook handler."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        sig = request.META.get("HTTP_X_PAYSTACK_SIGNATURE", "")
        gw = get_payment_gateway()
        result = gw.handle_webhook(request.body, sig)
        return Response(result, status=result.get("status_code", 200))


class VerifyPaymentView(APIView):
    """POST /api/payments/verify/ — verify a Paystack payment reference on demand."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ref = (request.data.get("reference") or "").strip()
        if not ref:
            return Response({"detail": "Provide a payment reference."}, status=400)
        tx = PaymentTransaction.objects.filter(reference=ref).first()
        if not tx or (tx.user_id != request.user.pk and not is_admin_or_mod(request.user)):
            return Response({"detail": "Payment reference not found."}, status=404)
        gw = get_payment_gateway()
        return Response(gw.verify_reference(ref))


class InitiateVerificationPaymentView(APIView):
    """POST /api/verification/initiate-payment/ — initiate ₦1,500 Paystack DVA / transfer payment for Student Verification.

    Note: Django Administrators can still manually verify any user in Django Admin without payment.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.is_verified_student:
            return Response({"detail": "Your student account is already verified."}, status=400)
        gw = get_payment_gateway()
        res = gw.initiate_payment(
            user=request.user,
            amount_ngn=VERIFICATION_FEE_NGN,
            purpose=PaymentTransaction.Purpose.STUDENT_VERIFICATION,
        )
        return Response({
            "enabled": res.enabled,
            "status": res.status,
            "message": res.message,
            "amount_ngn": res.amount_ngn,
            "reference": res.reference,
            "bank_name": res.bank_name,
            "account_number": res.account_number,
            "account_name": res.account_name,
            "checkout_url": res.checkout_url,
        })
