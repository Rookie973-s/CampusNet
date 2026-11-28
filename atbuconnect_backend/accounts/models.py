import random
import secrets
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.utils import timezone


AVATAR_COLORS = [
    "#3B82F6", "#8B5CF6", "#F97316", "#10B981",
    "#EF4444", "#EAB308", "#06B6D4", "#EC4899",
]


def random_avatar_color():
    """Callable default: evaluated per user, not once at import time."""
    return random.choice(AVATAR_COLORS)


def user_avatar_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"profiles/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


def verification_private_storage():
    if getattr(settings, "USE_DB_MEDIA", False):
        from media_app.storage import DatabasePrivateStorage
        return DatabasePrivateStorage()
    root = getattr(settings, "LIBRARY_PRIVATE_ROOT", None) or (settings.BASE_DIR / "private_media")
    return FileSystemStorage(location=str(root), base_url=None)


def verification_doc_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin")[:5]
    return f"verification_docs/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class User(AbstractUser):
    """
    Custom user model covering students, verified SUG/staff, and administrators.
    """

    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"
        ADMIN = "admin", "Admin"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)

    # Shared / profile fields
    avatar_bg = models.CharField(max_length=7, default=random_avatar_color)
    profile_picture = models.ImageField(upload_to=user_avatar_path, blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, unique=True, null=True)
    bio = models.TextField(blank=True)
    department = models.ForeignKey(
        "departments.Department", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="members",
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)

    # Student-only
    matric_number = models.CharField(max_length=32, blank=True)
    level = models.CharField(max_length=32, blank=True)  # e.g. "300 Level"
    is_verified_student = models.BooleanField(default=False)
    verification_expires_at = models.DateTimeField(null=True, blank=True)

    # Staff / SUG-only
    staff_id = models.CharField(max_length=32, blank=True)
    title = models.CharField(max_length=100, blank=True)
    is_verified_staff = models.BooleanField(default=False)

    # Account security, verification & entitlements
    username_changed_at = models.DateTimeField(null=True, blank=True)
    email_verified = models.BooleanField(default=False)
    max_post_length = models.PositiveIntegerField(default=1000)
    hide_ads = models.BooleanField(default=False)

    # Preferences / identity providers
    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        HAUSA = "ha", "Hausa"

    language = models.CharField(max_length=2, choices=Language.choices, default=Language.ENGLISH)
    google_sub = models.CharField(
        max_length=64, null=True, blank=True, unique=True,
        help_text="Google account id; set only for accounts created through Google sign-in.",
    )

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def display_name(self):
        return self.get_full_name() or self.username

    @property
    def initials(self):
        name = self.display_name.strip()
        parts = [p for p in name.split() if p]
        if not parts:
            return "U"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[-1][0]).upper()

    @property
    def answers_count(self):
        return self.answers.count()

    @property
    def questions_count(self):
        return self.questions.count()

    @property
    def rating(self):
        """Average rating from staff ratings, defaults to 5.0 for new staff."""
        agg = self.received_ratings.aggregate(models.Avg("score"))["score__avg"]
        return round(agg, 1) if agg else 5.0

    @property
    def sug_rating(self):
        """Average rating from SUG performance ratings, defaults to 0.0 when unrated."""
        agg = self.received_sug_ratings.aggregate(models.Avg("score"))["score__avg"]
        return round(agg, 1) if agg is not None else 0.0

    @property
    def sug_ratings_count(self):
        return self.received_sug_ratings.count()


class StaffRating(models.Model):
    staff = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_ratings")
    rater = models.ForeignKey(User, on_delete=models.CASCADE, related_name="given_ratings")
    score = models.PositiveSmallIntegerField()  # 1-5
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("staff", "rater")

    def __str__(self):
        return f"{self.rater} -> {self.staff}: {self.score}"


class SUGRating(models.Model):
    """Performance rating for SUG representatives (school & CampusNetwork performance)."""
    sug = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_sug_ratings")
    rater = models.ForeignKey(User, on_delete=models.CASCADE, related_name="given_sug_ratings")
    score = models.PositiveSmallIntegerField()  # 1-5
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("sug", "rater")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.rater} -> {self.sug}: {self.score}"


class Follow(models.Model):
    """`follower` follows `following`. One row per pair; self-follows are rejected by the database."""

    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following_set")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="followers_set")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="unique_follow"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("following")), name="no_self_follow"
            ),
        ]

    def __str__(self):
        return f"{self.follower} -> {self.following}"


class PasswordResetToken(models.Model):
    """Single-use, time-limited 6-digit code + secure reset token for password recovery."""
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    code = models.CharField(max_length=6)
    token = models.CharField(max_length=64, unique=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    code_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"PasswordResetToken for {self.user} ({'used' if self.used else 'active'})"

    def is_valid(self):
        return (
            not self.used
            and self.attempts < self.MAX_ATTEMPTS
            and timezone.now() < self.expires_at
        )

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(48)[:64]
        if not self.code:
            self.code = f"{secrets.randbelow(1000000):06d}"
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(minutes=15)
        super().save(*args, **kwargs)


class EmailVerificationToken(models.Model):
    """Single-use expiring token + 6-digit code for verifying a user's email address."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="email_verification_token")
    token = models.CharField(max_length=64, unique=True)
    code = models.CharField(max_length=6, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"EmailVerificationToken for {self.user}"

    def is_valid(self):
        return timezone.now() < self.expires_at

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(48)[:64]
        if not self.code:
            self.code = f"{secrets.randbelow(1000000):06d}"
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=24)
        super().save(*args, **kwargs)


class StudentVerificationApplication(models.Model):
    """Application for the verified student checkmark badge (separate from SUG/staff)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending Review"
        AWAITING_PAYMENT = "awaiting_payment", "Approved — Awaiting Payment"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        INFO_REQUIRED = "info_required", "Additional Information Required"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="student_verification_applications")
    faculty = models.ForeignKey(
        "departments.Department", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="student_verifications_faculty",
    )
    department = models.ForeignKey(
        "departments.Department", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="student_verifications_dept",
    )
    department_name = models.CharField(max_length=120, blank=True)
    level = models.CharField(max_length=32)
    matric_number = models.CharField(max_length=32, blank=True, default="")
    reason = models.TextField(blank=True)
    supporting_document = models.FileField(
        upload_to=verification_doc_path,
        storage=verification_private_storage,
        blank=True,
        null=True,
    )
    liveness_video = models.FileField(
        upload_to=verification_doc_path,
        storage=verification_private_storage,
        blank=True,
        null=True,
    )
    is_renewal = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_link = models.CharField(max_length=255, blank=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reviewed_student_verifications",
    )
    review_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    consent = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

    def __str__(self):
        return f"StudentVerification({self.user}, {self.status})"
