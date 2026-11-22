from django.contrib import admin

from .models import AcademicDepartment, ClassRepresentative, Course, Document


@admin.register(AcademicDepartment)
class AcademicDepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "faculty")
    list_filter = ("faculty",)
    search_fields = ("name",)


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "level", "academic_department")
    list_filter = ("level", "academic_department__faculty", "academic_department")
    search_fields = ("code", "title")


@admin.register(ClassRepresentative)
class ClassRepresentativeAdmin(admin.ModelAdmin):
    list_display = ("user", "academic_department", "level", "active", "granted_by", "created_at")
    list_filter = ("active", "level", "academic_department")
    search_fields = ("user__username", "user__email", "user__matric_number")
    autocomplete_fields = ("user",)

    def save_model(self, request, obj, form, change):
        was_active = False
        if change and obj.pk:
            old = ClassRepresentative.objects.filter(pk=obj.pk).first()
            was_active = bool(old and old.active)
        if not change:
            obj.granted_by = request.user
        super().save_model(request, obj, form, change)
        if obj.active and (not change or not was_active):
            from notifications.models import Notification
            from notifications.services import notify
            notify(
                obj.user,
                notif_type=Notification.Type.CLASS_REP,
                text=(
                    f"You have been approved as Class Representative for "
                    f"{obj.level} Level {obj.academic_department.name}. You can now upload PDFs to the Library."
                ),
                actor=request.user,
                link="/library",
                dedupe_seconds=0,
            )


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "uploaded_by", "size_bytes", "created_at")
    list_filter = ("course__level", "course__academic_department__faculty")
    search_fields = ("title", "original_name", "course__code")
    readonly_fields = ("file", "original_name", "size_bytes", "uploaded_by", "created_at")
