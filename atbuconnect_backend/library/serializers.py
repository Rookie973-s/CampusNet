from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import AcademicDepartment, Course, Document
from .permissions import can_manage, can_upload_to_course, get_rep
from .validators import sanitize_filename, validate_pdf_upload


class CourseSerializer(serializers.ModelSerializer):
    faculty = serializers.IntegerField(source="academic_department.faculty_id", read_only=True)
    faculty_name = serializers.CharField(source="academic_department.faculty.name", read_only=True)
    department = serializers.PrimaryKeyRelatedField(source="academic_department", queryset=AcademicDepartment.objects.all())
    department_name = serializers.CharField(source="academic_department.name", read_only=True)

    class Meta:
        model = Course
        fields = ["id", "code", "title", "level", "faculty", "faculty_name", "department", "department_name"]

    def validate(self, attrs):
        request = self.context["request"]
        rep = get_rep(request.user)
        dept, level = attrs.get("academic_department"), attrs.get("level")
        if not rep or dept.pk != rep.academic_department_id or level != rep.level:
            raise serializers.ValidationError("You can only add courses for your own class.")
        return attrs


class DocumentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.select_related("academic_department__faculty"))
    course_code = serializers.CharField(source="course.code", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    level = serializers.IntegerField(source="course.level", read_only=True)
    faculty = serializers.IntegerField(source="course.academic_department.faculty_id", read_only=True)
    faculty_name = serializers.CharField(source="course.academic_department.faculty.name", read_only=True)
    department = serializers.IntegerField(source="course.academic_department_id", read_only=True)
    department_name = serializers.CharField(source="course.academic_department.name", read_only=True)
    uploader = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = ["id", "title", "description", "course", "course_code", "course_title", "level",
                  "faculty", "faculty_name", "department", "department_name", "file", "original_name",
                  "size_bytes", "is_flagged", "security_warnings", "uploader", "created_at", "can_manage"]
        read_only_fields = ["id", "original_name", "size_bytes", "is_flagged", "security_warnings", "created_at"]

    def get_uploader(self, obj):
        u = obj.uploaded_by
        return (u.get_full_name() or u.get_username()) if u else None

    def get_can_manage(self, obj):
        req = self.context.get("request")
        return bool(req and can_manage(req.user, obj))

    def validate_title(self, v):
        v = v.strip()
        if len(v) < 3:
            raise serializers.ValidationError("Give the document a title (at least 3 characters).")
        return v

    def validate_file(self, f):
        try:
            self._pdf_warnings = validate_pdf_upload(f) or []
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])
        return f

    def validate_course(self, course):
        request = self.context["request"]
        if self.instance is None and not can_upload_to_course(request.user, course):
            raise serializers.ValidationError("You can only upload to courses of your own class.")
        return course

    def create(self, validated):
        f = validated["file"]
        warnings = getattr(self, "_pdf_warnings", [])
        validated["original_name"] = sanitize_filename(f.name)
        validated["size_bytes"] = f.size
        validated["is_flagged"] = bool(warnings)
        validated["security_warnings"] = warnings
        validated["uploaded_by"] = self.context["request"].user
        return super().create(validated)

    def update(self, instance, validated):
        # Metadata-only edits; the file, owner and course are immutable here.
        for k in ("title", "description"):
            if k in validated:
                setattr(instance, k, validated[k])
        instance.save()
        return instance
