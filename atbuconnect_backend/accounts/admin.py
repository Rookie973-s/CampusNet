from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from notifications.models import Notification
from notifications.services import notify

from .models import (
    EmailVerificationToken, Follow, PasswordResetToken, SUGRating,
    StaffRating, StudentVerificationApplication, User,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "username", "email", "first_name", "last_name", "role",
        "is_verified_staff", "is_verified_student", "email_verified", "department",
    ]
    list_filter = ["role", "is_verified_staff", "is_verified_student", "email_verified", "department"]
    search_fields = ["username", "email", "first_name", "last_name", "phone_number", "matric_number"]
    fieldsets = BaseUserAdmin.fieldsets + (
        ("CampusNetwork (Cenet) profile", {
            "fields": (
                "role", "avatar_bg", "profile_picture", "phone", "phone_number", "bio",
                "department", "is_online", "matric_number", "level",
                "staff_id", "title", "is_verified_staff", "is_verified_student",
                "email_verified", "hide_ads", "language",
            )
        }),
    )


@admin.register(StaffRating)
class StaffRatingAdmin(admin.ModelAdmin):
    list_display = ["staff", "rater", "score", "created_at"]


@admin.register(SUGRating)
class SUGRatingAdmin(admin.ModelAdmin):
    list_display = ["sug", "rater", "score", "comment", "updated_at"]
    search_fields = ["sug__username", "rater__username", "comment"]


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ["follower", "following", "created_at"]
    search_fields = ["follower__username", "following__username"]


@admin.register(StudentVerificationApplication)
class StudentVerificationApplicationAdmin(admin.ModelAdmin):
    list_display = ["user", "matric_number", "faculty", "level", "status", "created_at", "reviewed_by"]
    list_filter = ["status", "faculty", "level"]
    search_fields = ["user__username", "user__email", "matric_number"]
    actions = ["approve_without_payment", "reject_selected"]

    @admin.action(description="Approve selected student verification applications (no payment needed)")
    def approve_without_payment(self, request, queryset):
        count = 0
        for app in queryset:
            app.status = StudentVerificationApplication.Status.APPROVED
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            from datetime import timedelta
            app.save()
            app.user.is_verified_student = True
            app.user.verification_expires_at = timezone.now() + timedelta(days=90)
            app.user.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text="Congratulations! Your CampusNetwork Student Verification badge is now active.",
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
            count += 1
        self.message_user(request, f"{count} student(s) verified.", messages.SUCCESS)

    @admin.action(description="Reject selected student verification applications")
    def reject_selected(self, request, queryset):
        n = queryset.update(status=StudentVerificationApplication.Status.REJECTED, reviewed_by=request.user, reviewed_at=timezone.now())
        self.message_user(request, f"{n} application(s) rejected.", messages.WARNING)


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "used", "attempts", "expires_at", "created_at"]
    readonly_fields = ["user", "used", "attempts", "expires_at", "created_at"]
    exclude = ["code", "token"]


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "expires_at", "created_at"]
    readonly_fields = ["user", "expires_at", "created_at"]
    exclude = ["code", "token"]
