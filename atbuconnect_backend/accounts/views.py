import re
from datetime import datetime, time, timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, parsers, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from config.security import send_platform_email, validate_and_reencode_image
from notifications.models import Notification
from notifications.services import notify

from .entitlements import is_admin_or_mod
from .google import GoogleAuthNotConfigured, verify_google_credential
from .models import (
    EmailVerificationToken, Follow, PasswordResetToken, SUGRating,
    StudentVerificationApplication,
)
from .serializers import (
    MeSerializer, PublicProfileSerializer, RegisterSerializer,
    SUGRatingSerializer, StaffDirectorySerializer,
    StudentVerificationApplicationSerializer, UserPublicSerializer,
    normalize_phone,
)

User = get_user_model()


def tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


def _send_welcome_and_verification(user):
    notify(
        user,
        notif_type=Notification.Type.WELCOME,
        text=(
            f"Welcome to CampusNetwork (Cenet), {user.display_name}! "
            "Explore discussions, join communities, and verify your email in Settings."
        ),
        link="/profile",
        dedupe_seconds=86400,
    )
    if not user.email_verified and user.email:
        EmailVerificationToken.objects.filter(user=user).delete()
        tok = EmailVerificationToken.objects.create(user=user)
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
        link = f"{frontend_url}/profile?verify_email={tok.token}"
        send_platform_email(
            recipient_email=user.email,
            subject="Verify your CampusNetwork (Cenet) email address",
            message=(
                f"Hello {user.display_name},\n\n"
                f"Welcome to CampusNetwork (Cenet)! Please confirm your email address using either:\n"
                f"- Verification code: {tok.code}\n"
                f"- Direct link: {link}\n\n"
                f"This verification expires in 24 hours.\n\n— CampusNetwork (Cenet)"
            ),
            allow_formsubmit=False,  # NEVER expose verification tokens to external form endpoints
        )


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        _send_welcome_and_verification(user)
        return Response(
            {"user": MeSerializer(user, context={"request": request}).data, **tokens_for_user(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    POST /api/auth/login/ {"username": "...", "password": "..."}.

    Accepts phone number, email address, username, or legacy matric number.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request, *args, **kwargs):
        identifier = str(request.data.get("username") or request.data.get("identifier") or "").strip()
        password = request.data.get("password", "")
        norm_phone = normalize_phone(identifier)

        user = (
            User.objects.filter(username__iexact=identifier).first()
            or User.objects.filter(email__iexact=identifier).first()
            or (User.objects.filter(phone_number=norm_phone).first() if norm_phone else None)
            or (User.objects.filter(phone__iexact=identifier).first() if identifier else None)
            or User.objects.filter(matric_number__iexact=identifier).first()
        )

        if not user or not authenticate(request, username=user.username, password=password):
            return Response(
                {"detail": "Invalid username, email, or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response({"user": MeSerializer(user, context={"request": request}).data, **tokens_for_user(user)})


class MeView(APIView):
    """GET/PATCH/DELETE /api/auth/me/"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = MeSerializer(request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request):
        """NDPA-compliant account deletion requiring current password confirmation for local accounts."""
        user = request.user
        if user.has_usable_password():
            password = request.data.get("password", "")
            if not password or not user.check_password(password):
                return Response(
                    {"detail": "Please confirm your current password to delete your account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        user.delete()
        return Response({"detail": "Your account and associated personal data have been permanently deleted."}, status=200)


class AvatarUploadView(APIView):
    """POST /api/auth/me/avatar/ — upload and sanitize user profile picture (strips EXIF)."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request):
        f = request.FILES.get("avatar") or request.FILES.get("profile_picture") or request.FILES.get("file")
        if not f:
            return Response({"detail": "Select an image file to upload."}, status=400)
        try:
            clean = validate_and_reencode_image(f, max_bytes=5 * 1024 * 1024, max_dim=800)
        except DjangoValidationError as e:
            return Response({"detail": e.messages[0]}, status=400)

        user = request.user
        if user.profile_picture:
            try:
                user.profile_picture.delete(save=False)
            except Exception:
                pass
        user.profile_picture.save(clean.name, clean, save=True)
        return Response(MeSerializer(user, context={"request": request}).data)

    def delete(self, request):
        user = request.user
        if user.profile_picture:
            user.profile_picture.delete(save=True)
        return Response(MeSerializer(user, context={"request": request}).data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — supports both local password accounts and Google-only accounts."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        if user.has_usable_password():
            if not current_password or not user.check_password(current_password):
                return Response({"current_password": "Your current password is incorrect."}, status=400)

        if not new_password:
            return Response({"new_password": "Enter a new password."}, status=400)
        if new_password != confirm_password:
            return Response({"confirm_password": "New passwords do not match."}, status=400)

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response({"new_password": e.messages[0]}, status=400)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated successfully.", **tokens_for_user(user)})


class ForgotPasswordView(APIView):
    """POST /api/auth/forgot-password/ — generates single-use expiring 6-digit code + reset link.

    Always returns a generic success message to prevent email enumeration.
    Rate-limited per IP (DRF throttle) and per email (max 3/hour).
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        if not email:
            return Response({"detail": "Enter your registered email address."}, status=400)

        generic = {
            "detail": "If an account with that email exists, a 6-digit verification code and reset link have been sent.",
        }

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response(generic)

        # Per-email rate limit: max 3 requests in the last hour
        hour_ago = timezone.now() - timedelta(hours=1)
        if PasswordResetToken.objects.filter(user=user, created_at__gte=hour_ago).count() >= 3:
            return Response(generic)

        # Invalidate older active codes
        PasswordResetToken.objects.filter(user=user, used=False).update(used=True)
        tok = PasswordResetToken.objects.create(user=user)

        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link = f"{frontend_url}/?reset_token={tok.token}"
        send_platform_email(
            recipient_email=user.email,
            subject="CampusNetwork (Cenet) Password Reset Code",
            message=(
                f"Hello {user.display_name},\n\n"
                f"Use this single-use verification code to reset your CampusNetwork password:\n\n"
                f"    {tok.code}\n\n"
                f"Or open this reset link directly:\n    {reset_link}\n\n"
                f"This code expires in 15 minutes. If you did not request this, ignore this email.\n\n"
                f"— CampusNetwork (Cenet)"
            ),
            allow_formsubmit=False,  # STRICTLY NEVER send reset codes via FormSubmit!
        )
        return Response(generic)


class VerifyResetCodeView(APIView):
    """POST /api/auth/verify-reset-code/ {"email": "...", "code": "123456"}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        code = (request.data.get("code") or "").strip()
        if not email or not code:
            return Response({"detail": "Email and 6-digit code are required."}, status=400)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        tok = (
            PasswordResetToken.objects.filter(user=user, used=False).order_by("-created_at").first()
            if user
            else None
        )
        if not tok or not tok.is_valid():
            return Response({"detail": "Invalid or expired verification code."}, status=400)

        if tok.code != code:
            tok.attempts += 1
            if tok.attempts >= PasswordResetToken.MAX_ATTEMPTS:
                tok.used = True
            tok.save(update_fields=["attempts", "used"])
            return Response({"detail": "Invalid verification code."}, status=400)

        tok.code_verified = True
        tok.save(update_fields=["code_verified"])
        return Response({"valid": True, "token": tok.token})


class ResetPasswordView(APIView):
    """POST /api/auth/reset-password/ {"token": "...", "new_password": "...", "confirm_password": "..."}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        if not token:
            return Response({"detail": "Reset token is required."}, status=400)
        if not new_password or new_password != confirm_password:
            return Response({"detail": "Passwords do not match."}, status=400)

        tok = PasswordResetToken.objects.select_related("user").filter(token=token).first()
        if not tok or not tok.is_valid():
            return Response({"detail": "This reset token is invalid or has expired."}, status=400)

        user = tok.user
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response({"detail": e.messages[0]}, status=400)

        with transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=["password"])
            PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

        return Response({"detail": "Password has been reset successfully. You can now sign in."})


class SendEmailVerificationView(APIView):
    """POST /api/auth/send-verification/ — rate-limited resend of email confirmation link & code."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verify"

    def post(self, request):
        user = request.user
        if user.email_verified:
            return Response({"detail": "Your email address is already verified.", "email_verified": True})

        existing = EmailVerificationToken.objects.filter(user=user).first()
        if existing and (timezone.now() - existing.created_at) < timedelta(minutes=2):
            return Response(
                {"detail": "Please wait 2 minutes before requesting another verification email."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        EmailVerificationToken.objects.filter(user=user).delete()
        tok = EmailVerificationToken.objects.create(user=user)
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
        link = f"{frontend_url}/profile?verify_email={tok.token}"
        send_platform_email(
            recipient_email=user.email,
            subject="Verify your CampusNetwork (Cenet) email address",
            message=(
                f"Hello {user.display_name},\n\n"
                f"Confirm your email address using either:\n"
                f"- 6-digit code: {tok.code}\n"
                f"- Direct link: {link}\n\n"
                f"Expires in 24 hours.\n\n— CampusNetwork (Cenet)"
            ),
            allow_formsubmit=False,
        )
        return Response({"detail": "Verification email sent. Check your inbox (or server console in local development)."})


class VerifyEmailView(APIView):
    """POST /api/auth/verify-email/ {"token": "..."} OR (authenticated) {"code": "123456"}"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        code = (request.data.get("code") or "").strip()

        tok = None
        if token:
            tok = EmailVerificationToken.objects.select_related("user").filter(token=token).first()
        elif code and request.user and request.user.is_authenticated:
            tok = EmailVerificationToken.objects.select_related("user").filter(
                user=request.user, code=code
            ).first()
        else:
            return Response({"detail": "Verification token or code is required."}, status=400)

        if not tok or not tok.is_valid():
            return Response({"detail": "Invalid or expired verification link/code."}, status=400)

        user = tok.user
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        tok.delete()
        return Response({"detail": "Email address verified successfully!", "email_verified": True})


class StaffDirectoryViewSet(generics.ListAPIView):
    """GET /api/staff/ — verified SUG officials & staff directory (registered users only)."""

    queryset = User.objects.filter(
        is_active=True, is_verified_staff=True
    ).filter(Q(role=User.Role.STAFF) | Q(role=User.Role.ADMIN)).select_related("department")
    serializer_class = StaffDirectorySerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["department__name"]
    search_fields = ["first_name", "last_name", "title", "username"]


class StaffDetailView(generics.RetrieveAPIView):
    queryset = User.objects.filter(is_active=True, is_verified_staff=True).select_related("department")
    serializer_class = StaffDirectorySerializer
    permission_classes = [permissions.IsAuthenticated]


class SUGRatingView(APIView):
    """GET/POST /api/users/<id>/rate-sug/ — rate an SUG rep (1-5) on school & Cenet performance."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        sug = get_object_or_404(User, pk=pk, is_active=True, is_verified_staff=True)
        ratings = sug.received_sug_ratings.select_related("rater", "rater__department")[:50]
        my = None
        if request.user.is_authenticated:
            r = sug.received_sug_ratings.filter(rater=request.user).first()
            if r:
                my = {"score": r.score, "comment": r.comment}
        breakdown = {str(s): sug.received_sug_ratings.filter(score=s).count() for s in range(1, 6)}
        return Response({
            "sug_id": sug.pk,
            "sug_rating": sug.sug_rating,
            "sug_ratings_count": sug.sug_ratings_count,
            "breakdown": breakdown,
            "my_rating": my,
            "reviews": SUGRatingSerializer(ratings, many=True, context={"request": request}).data,
        })

    def post(self, request, pk):
        sug = get_object_or_404(User, pk=pk, is_active=True, is_verified_staff=True)
        if sug.pk == request.user.pk:
            return Response({"detail": "You cannot rate yourself."}, status=400)
        try:
            score = int(request.data.get("score"))
        except (TypeError, ValueError):
            return Response({"detail": "Score must be an integer between 1 and 5."}, status=400)
        if score < 1 or score > 5:
            return Response({"detail": "Score must be between 1 and 5."}, status=400)
        comment = (request.data.get("comment") or "").strip()[:500]
        rating, created = SUGRating.objects.update_or_create(
            sug=sug, rater=request.user, defaults={"score": score, "comment": comment}
        )
        notify(
            sug,
            notif_type=Notification.Type.SYSTEM,
            text=f"{request.user.display_name} rated your SUG performance {score}/5.",
            actor=request.user,
            link="/sug",
        )
        return Response(
            {
                "score": rating.score,
                "comment": rating.comment,
                "sug_rating": sug.sug_rating,
                "sug_ratings_count": sug.sug_ratings_count,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class UserSearchView(APIView):
    """GET /api/users/search/?q=... — search registered users by username or name."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip().lstrip("@")
        if not q:
            return Response([])
        qs = (
            User.objects.filter(is_active=True)
            .filter(
                Q(username__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )
            .select_related("department")
            .order_by("username")[:15]
        )
        return Response(UserPublicSerializer(qs, many=True, context={"request": request}).data)


class PublicProfileView(generics.RetrieveAPIView):
    """GET /api/users/<id>/ — public profile card."""

    queryset = User.objects.filter(is_active=True).select_related("department")
    serializer_class = PublicProfileSerializer
    permission_classes = [permissions.AllowAny]


class PublicProfileByUsernameView(APIView):
    """GET /api/users/by-username/<username>/ — look up public profile from an @mention."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = get_object_or_404(User.objects.select_related("department"), username__iexact=username, is_active=True)
        return Response(PublicProfileSerializer(user, context={"request": request}).data)


class FollowView(APIView):
    """POST /api/users/<id>/follow/ follows, DELETE unfollows."""

    permission_classes = [permissions.IsAuthenticated]

    def _target(self, request, pk):
        target = get_object_or_404(User, pk=pk, is_active=True)
        if target.pk == request.user.pk:
            return None
        return target

    def post(self, request, pk):
        target = self._target(request, pk)
        if target is None:
            return Response({"detail": "You can't follow yourself."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                _, created = Follow.objects.get_or_create(follower=request.user, following=target)
        except IntegrityError:
            created = False
        if created:
            notify(
                target,
                notif_type=Notification.Type.FOLLOW,
                text=f"{request.user.display_name} (@{request.user.username}) started following you.",
                actor=request.user,
                link="/profile",
            )
        return Response(
            {"is_following": True, "followers": target.followers_set.count()},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        target = self._target(request, pk)
        if target is None:
            return Response({"detail": "You can't unfollow yourself."}, status=status.HTTP_400_BAD_REQUEST)
        Follow.objects.filter(follower=request.user, following=target).delete()
        return Response({"is_following": False, "followers": target.followers_set.count()})


class FollowersListView(APIView):
    """GET /api/users/<id>/followers/"""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        target = get_object_or_404(User, pk=pk, is_active=True)
        follower_ids = Follow.objects.filter(following=target).order_by("-created_at").values_list("follower_id", flat=True)[:100]
        users = User.objects.filter(pk__in=follower_ids, is_active=True).select_related("department")
        return Response(PublicProfileSerializer(users, many=True, context={"request": request}).data)


class FollowingListView(APIView):
    """GET /api/users/<id>/following/"""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        target = get_object_or_404(User, pk=pk, is_active=True)
        following_ids = Follow.objects.filter(follower=target).order_by("-created_at").values_list("following_id", flat=True)[:100]
        users = User.objects.filter(pk__in=following_ids, is_active=True).select_related("department")
        return Response(PublicProfileSerializer(users, many=True, context={"request": request}).data)


def _has_paid_verification(user) -> bool:
    """True if the user has a confirmed Paystack ₦1,500 verification payment usable for a new/renewal application."""
    from advertising.models import PaymentTransaction
    qs = PaymentTransaction.objects.filter(
        user=user,
        purpose=PaymentTransaction.Purpose.STUDENT_VERIFICATION,
        status=PaymentTransaction.Status.PAID,
    )
    last_approved = StudentVerificationApplication.objects.filter(
        user=user, status=StudentVerificationApplication.Status.APPROVED
    ).order_by("-reviewed_at").first()
    if last_approved and last_approved.reviewed_at:
        qs = qs.filter(paid_at__gt=last_approved.reviewed_at)
    return qs.exists()


class StudentVerificationApplyView(APIView):
    """POST /api/verification/apply/ — apply or renew 3-month student verification badge."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def post(self, request):
        user = request.user
        now = timezone.now()
        is_active = bool(user.is_verified_student and (not user.verification_expires_at or now < user.verification_expires_at))
        if is_active:
            return Response({"detail": "Your account is already student-verified."}, status=400)
        if StudentVerificationApplication.objects.filter(
            user=user, status=StudentVerificationApplication.Status.PENDING
        ).exists():
            return Response({"detail": "You already have a verification application pending review."}, status=400)

        prev_with_doc = StudentVerificationApplication.objects.filter(
            user=user, supporting_document__isnull=False
        ).exclude(supporting_document="").order_by("-created_at").first()
        is_renewal = bool(user.is_verified_student and user.verification_expires_at and now >= user.verification_expires_at and prev_with_doc)

        # Enforce ₦1,500 Paystack payment unless admin or Paystack is not configured (local test mode)
        from advertising.payments import get_payment_gateway
        if not is_admin_or_mod(user) and get_payment_gateway().is_enabled() and not _has_paid_verification(user):
            return Response(
                {"detail": "Please complete the ₦1,500 Paystack verification payment before submitting your application."},
                status=402,
            )

        ser = StudentVerificationApplicationSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        has_new_doc = bool(request.FILES.get("supporting_document"))
        if not has_new_doc and not is_renewal and not is_admin_or_mod(user) and request.content_type and "multipart" in request.content_type:
            return Response(
                {"supporting_document": ["Please upload your Admission Form or Student ID card."]},
                status=400,
            )
        save_kwargs = {"user": user, "status": StudentVerificationApplication.Status.PENDING, "is_renewal": is_renewal}
        if is_renewal and not has_new_doc and prev_with_doc:
            save_kwargs["supporting_document"] = prev_with_doc.supporting_document
        app = ser.save(**save_kwargs)
        return Response(StudentVerificationApplicationSerializer(app, context={"request": request}).data, status=201)


class StudentVerificationStatusView(APIView):
    """GET /api/verification/status/ — current user's student verification status, 3-month expiry & payment state."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        now = timezone.now()
        exp = getattr(user, "verification_expires_at", None)
        is_expired = bool(user.is_verified_student and exp and now >= exp)
        is_active = bool(user.is_verified_student and not is_expired)
        latest = StudentVerificationApplication.objects.filter(user=user).select_related("faculty").first()
        has_existing_doc = StudentVerificationApplication.objects.filter(
            user=user, supporting_document__isnull=False
        ).exclude(supporting_document="").exists()
        paid = _has_paid_verification(user) or is_admin_or_mod(user)
        from advertising.payments import get_payment_gateway
        return Response({
            "is_verified_student": is_active,
            "is_expired": is_expired,
            "verification_expires_at": exp.isoformat() if exp else None,
            "has_paid_verification": paid,
            "payment_required": get_payment_gateway().is_enabled() and not is_admin_or_mod(user),
            "has_existing_document": has_existing_doc,
            "status": (
                "expired" if is_expired
                else (latest.status if latest else ("approved" if is_active else "not_applied"))
            ),
            "application": StudentVerificationApplicationSerializer(latest, context={"request": request}).data if latest else None,
        })


class StudentVerificationAdminListView(APIView):
    """GET /api/verification/applications/ — admin only."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_admin_or_mod(request.user):
            return Response({"detail": "Admin access required."}, status=403)
        qs = StudentVerificationApplication.objects.select_related("user", "faculty", "department")
        wanted = request.query_params.get("status")
        if wanted in dict(StudentVerificationApplication.Status.choices):
            qs = qs.filter(status=wanted)
        return Response(StudentVerificationApplicationSerializer(qs[:100], many=True, context={"request": request}).data)


class StudentVerificationDecisionView(APIView):
    """POST /api/verification/applications/<id>/<decision>/ (approve | reject | info_required | revoke)"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, decision):
        if not is_admin_or_mod(request.user):
            return Response({"detail": "Only administrators can review student verification applications."}, status=403)
        app = get_object_or_404(StudentVerificationApplication.objects.select_related("user"), pk=pk)
        note = (request.data.get("note") or "").strip()
        payment_link = (request.data.get("payment_link") or "").strip()

        if decision == "approve":
            app.status = StudentVerificationApplication.Status.APPROVED
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.review_note = note
            if payment_link:
                app.payment_link = payment_link
            app.save()
            app.user.is_verified_student = True
            app.user.verification_expires_at = timezone.now() + timedelta(days=90)
            if app.level and not app.user.level:
                app.user.level = app.level
            app.user.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text="Congratulations! Your CampusNetwork Student Verification badge is now active.",
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
            send_platform_email(
                recipient_email=app.user.email,
                subject="CampusNetwork (Cenet): Student Verification Approved",
                message=(
                    f"Hello {app.user.display_name},\n\n"
                    f"Your student verification has been approved! Your verified student badge and perks are now active."
                    + (f"\n\nPayment / Receipt Link: {payment_link}" if payment_link else "")
                    + (f"\nNote: {note}" if note else "")
                    + "\n\n— CampusNetwork (Cenet)"
                ),
                allow_formsubmit=True,
            )
        elif decision == "reject":
            app.status = StudentVerificationApplication.Status.REJECTED
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.review_note = note
            app.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text=f"Your student verification application was not approved. {note[:120]}".strip(),
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
        elif decision == "info_required":
            app.status = StudentVerificationApplication.Status.INFO_REQUIRED
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.review_note = note
            if payment_link:
                app.payment_link = payment_link
            app.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text=f"More info needed for your student verification: {note[:120]}".strip(),
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
        elif decision == "revoke":
            app.user.is_verified_student = False
            app.user.hide_ads = False
            app.user.save(update_fields=["is_verified_student", "hide_ads"])
            app.status = StudentVerificationApplication.Status.REJECTED
            app.review_note = note or "Verification revoked by administrator."
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text="Your student verification badge has been revoked by an administrator.",
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
        else:
            return Response({"detail": "Invalid decision."}, status=400)

        return Response(StudentVerificationApplicationSerializer(app, context={"request": request}).data)


class ActivityView(APIView):
    """GET /api/auth/me/activity/?days=84"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            days = max(7, min(int(request.query_params.get("days", 84)), 365))
        except ValueError:
            days = 84
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))

        def per_day(qs):
            rows = qs.filter(created_at__gte=since).annotate(d=TruncDate("created_at")).values("d").annotate(n=Count("id"))
            return {r["d"]: r["n"] for r in rows}

        qd = per_day(request.user.questions.all())
        ad = per_day(request.user.answers.all())
        series = []
        for i in range(days):
            d = start + timedelta(days=i)
            q, a = qd.get(d, 0), ad.get(d, 0)
            series.append({"date": d.isoformat(), "questions": q, "answers": a, "total": q + a})
        return Response({
            "days": days,
            "series": series,
            "totals": {
                "questions": request.user.questions.count(),
                "answers": request.user.answers.count(),
            },
        })


def _unique_username(base: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_.-]", "", base)[:30] or "student"
    candidate, n = base, 1
    while User.objects.filter(username__iexact=candidate).exists():
        n += 1
        candidate = f"{base}{n}"
    return candidate


class GoogleLoginView(APIView):
    """POST /api/auth/google/ {"credential": "<Google ID token>"}"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        credential = str(request.data.get("credential", "")).strip()
        if not credential:
            return Response({"detail": "Missing Google credential."}, status=400)
        try:
            claims = verify_google_credential(credential)
        except GoogleAuthNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        except ValueError:
            return Response({"detail": "Google sign-in could not be verified."}, status=401)

        sub, email = claims.get("sub"), (claims.get("email") or "").strip()
        if not sub or not email or not claims.get("email_verified"):
            return Response({"detail": "Your Google email is not verified."}, status=401)

        user = User.objects.filter(google_sub=sub).first()
        created = False
        if user is None:
            if User.objects.filter(email__iexact=email).exists():
                return Response(
                    {"detail": "An account with this email already exists. Sign in with your password."},
                    status=status.HTTP_409_CONFLICT,
                )
            user = User(
                username=_unique_username(email.split("@")[0]),
                email=email,
                first_name=(claims.get("given_name") or "")[:150],
                last_name=(claims.get("family_name") or "")[:150],
                role=User.Role.STUDENT,
                google_sub=sub,
                email_verified=True,
            )
            user.set_unusable_password()
            user.save()
            created = True
        if not user.is_active:
            return Response({"detail": "This account is disabled."}, status=403)
        if created:
            notify(
                user,
                notif_type=Notification.Type.WELCOME,
                text=f"Welcome to CampusNetwork (Cenet), {user.display_name}! Explore discussions and join communities.",
                link="/profile",
            )
        return Response({"user": MeSerializer(user, context={"request": request}).data, **tokens_for_user(user)})
