import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def sug_avatar_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"sug_applications/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class StaffApplication(models.Model):
    """Mirrors the multi-step form in ApplyPage.jsx (SUG / verified representative application)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    # Step 1 — Personal Info
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    profile_picture = models.ImageField(upload_to=sug_avatar_path, blank=True, null=True)

    # Step 2 — Academic Details (ID document + camera liveness scan replace matric numbers)
    staff_id = models.CharField(max_length=32, blank=True, default="", help_text="Optional SUG Office Code")
    department = models.ForeignKey("departments.Department", on_delete=models.SET_NULL, null=True)
    academic_department_name = models.CharField(max_length=120, blank=True, default="")
    role_title = models.CharField(max_length=120, help_text="Current role / title")
    academic_references = models.CharField(max_length=255, blank=True)
    supporting_document = models.FileField(upload_to=sug_avatar_path, blank=True, null=True)
    liveness_video = models.FileField(upload_to=sug_avatar_path, blank=True, null=True)

    # Step 3 — Statement
    bio = models.TextField()
    why = models.TextField()

    # Review
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="reviewed_applications",
    )
    review_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Linked once approved & an account is created/promoted
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="staff_application",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.status})"
