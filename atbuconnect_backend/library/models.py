import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.utils.module_loading import import_string

from . import conf

# The existing `departments.Department` rows are what the product calls "faculties"
# (Computing, Engineering, Sciences...). They are reused unchanged as the Faculty level;
# AcademicDepartment (below) adds the departments that sit under a faculty.
FACULTY_MODEL = "departments.Department"


def private_storage():
    """PDFs live outside MEDIA_ROOT/MEDIA_URL so they are never served publicly.

    Uses PostgreSQL-backed `DatabasePrivateStorage` by default so PDFs stay permanently
    synced across all devices and deployments without ephemeral disk loss."""
    custom = conf.get("LIBRARY_STORAGE", None)
    if custom:
        try:
            return import_string(custom)()
        except ImportError:
            pass
    if getattr(settings, "USE_DB_MEDIA", False):
        from media_app.storage import DatabasePrivateStorage
        return DatabasePrivateStorage()
    root = conf.get("LIBRARY_PRIVATE_ROOT", None) or (settings.BASE_DIR / "private_media")
    return FileSystemStorage(location=str(root), base_url=None)


def pdf_upload_path(instance, filename):
    # Never trust the client's filename: storage name is a random UUID.
    return f"library/pdfs/{uuid.uuid4().hex}.pdf"


def validate_level(value):
    if value not in conf.LEVELS():
        raise ValidationError("Choose a valid academic level.")


class AcademicDepartment(models.Model):
    """A department inside a faculty, e.g. Biochemistry under Sciences. Admin-managed."""

    faculty = models.ForeignKey(FACULTY_MODEL, on_delete=models.CASCADE, related_name="academic_departments")
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["faculty", "name"], name="unique_dept_per_faculty")]

    def __str__(self):
        return f"{self.name} ({self.faculty})"


class Course(models.Model):
    academic_department = models.ForeignKey(AcademicDepartment, on_delete=models.CASCADE, related_name="courses")
    code = models.CharField(max_length=20, help_text="e.g. BIO 111")
    title = models.CharField(max_length=160, blank=True)
    level = models.PositiveSmallIntegerField(validators=[validate_level], db_index=True)

    class Meta:
        ordering = ["level", "code"]
        constraints = [models.UniqueConstraint(fields=["academic_department", "code"], name="unique_course_code")]

    def save(self, *args, **kwargs):
        self.code = " ".join(self.code.upper().split())
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} — {self.title}" if self.title else self.code


class ClassRepresentative(models.Model):
    """Admin-granted right to upload PDFs for ONE class (a level within a department).

    Deliberately a separate, explicit grant: nobody becomes a class representative
    automatically, and the grant is scoped, so a rep for 200L Biochemistry can't
    upload into 300L Physics."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="class_rep")
    academic_department = models.ForeignKey(AcademicDepartment, on_delete=models.CASCADE, related_name="class_reps")
    level = models.PositiveSmallIntegerField(validators=[validate_level])
    active = models.BooleanField(default=True)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} — {self.level}L {self.academic_department.name}{'' if self.active else ' (revoked)'}"


class Document(models.Model):
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="documents")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, max_length=2000)
    file = models.FileField(upload_to=pdf_upload_path, storage=private_storage)
    original_name = models.CharField(max_length=255, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    is_flagged = models.BooleanField(default=False)
    security_warnings = models.JSONField(default=list, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
                                    related_name="library_documents")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title
