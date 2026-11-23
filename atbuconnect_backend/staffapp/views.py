from rest_framework import mixins, parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from . import services
from .models import StaffApplication
from .serializers import StaffApplicationSerializer


class IsReviewer(permissions.BasePermission):
    def has_permission(self, request, view):
        return services.can_review(request.user)


class StaffApplicationViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    POST /api/applications/                 — anyone may apply (supports multipart for profile_picture)
    GET  /api/applications/status/?email=.. — public check of SUG application status by email
    GET  /api/applications/                 — reviewers only: the queue (?status=pending)
    GET  /api/applications/{id}/            — reviewers only
    POST /api/applications/{id}/approve/    — reviewers only, pending applications only
    POST /api/applications/{id}/reject/     — reviewers only, pending applications only
    """

    queryset = StaffApplication.objects.select_related("department", "reviewed_by")
    serializer_class = StaffApplicationSerializer
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "applications"

    def get_permissions(self):
        if self.action in ("create", "check_status"):
            return [permissions.AllowAny()]
        if self.action in ("cancel_sug", "cancel_pending"):
            return [permissions.IsAuthenticated()]
        return [IsReviewer()]

    def get_throttles(self):
        return super().get_throttles() if self.action in ("create", "check_status") else []

    def get_queryset(self):
        qs = super().get_queryset()
        wanted = self.request.query_params.get("status")
        if wanted in dict(StaffApplication.Status.choices):
            qs = qs.filter(status=wanted)
        return qs

    @action(detail=False, methods=["get"], url_path="status")
    def check_status(self, request):
        """Allow eligible SUG applicants to check their application status without logging in."""
        email = (request.query_params.get("email") or "").strip()
        if not email:
            return Response({"detail": "Provide your application email."}, status=status.HTTP_400_BAD_REQUEST)
        app = StaffApplication.objects.filter(email__iexact=email).order_by("-created_at").first()
        if not app:
            return Response({"found": False, "status": "not_found"})
        return Response({
            "found": True,
            "status": app.status,
            "role_title": app.role_title,
            "submitted_at": app.created_at.isoformat(),
            "reviewed_at": app.reviewed_at.isoformat() if app.reviewed_at else None,
            "review_note": app.review_note if app.status != StaffApplication.Status.PENDING else "",
        })

    def _decide(self, request, pk, approve):
        try:
            application, account_found = services.review_application(
                pk, request.user, approve, request.data.get("note", "")
            )
        except StaffApplication.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        except services.AlreadyReviewed as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        data = StaffApplicationSerializer(application, context={"request": request}).data
        data["account_found"] = account_found
        return Response(data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._decide(request, pk, True)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._decide(request, pk, False)

    @action(detail=False, methods=["post"], url_path="cancel-sug")
    def cancel_sug(self, request):
        """Allow an already-verified SUG representative to voluntarily relinquish their SUG status."""
        from accounts.models import User
        from accounts.serializers import MeSerializer

        user = request.user
        if not user.is_verified_staff:
            return Response({"detail": "You do not currently hold Verified SUG status."}, status=400)
        user.is_verified_staff = False
        if user.role == User.Role.STAFF:
            user.role = User.Role.STUDENT
        user.save(update_fields=["is_verified_staff", "role"])
        return Response({
            "detail": "Your Verified SUG status has been cancelled.",
            "user": MeSerializer(user, context={"request": request}).data,
        })

    @action(detail=False, methods=["post"], url_path="cancel-pending")
    def cancel_pending(self, request):
        """Allow an authenticated applicant to withdraw their own pending SUG application."""
        deleted, _ = StaffApplication.objects.filter(
            email__iexact=request.user.email, status=StaffApplication.Status.PENDING
        ).delete()
        if not deleted:
            return Response({"detail": "No pending SUG application found for your account."}, status=404)
        return Response({"detail": "Your pending SUG application has been withdrawn."})
