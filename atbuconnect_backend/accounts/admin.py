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

    def save_model(self, request, obj, form, change):
        # Automatically align role=STAFF whenever admin marks a student as Verified SUG
        if obj.is_verified_staff and obj.role == User.Role.STUDENT:
            obj.role = User.Role.STAFF
        super().save_model(request, obj, form, change)

    actions = ["suspend_selected_users", "unsuspend_selected_users"]

    @admin.action(description="Suspend selected accounts (notify in-app + email)")
    def suspend_selected_users(self, request, queryset):
        from .email_utils import send_platform_email
        count = 0
        for u in queryset.exclude(pk=request.user.pk).filter(is_superuser=False):
            u.is_active = False
            u.save(update_fields=["is_active"])
            reason = "Violation of CampusNetwork community guidelines."
            notify(
                u,
                notif_type=Notification.Type.SYSTEM,
                text=f"Your CampusNetwork account was suspended by an administrator. Reason: {reason}",
                actor=request.user,
                link="/profile",
                dedupe_seconds=0,
            )
            send_platform_email(
                recipient_email=u.email,
                subject="CampusNetwork (Cenet): Account Suspended",
                message=(
                    f"Hello {u.display_name},\n\n"
                    f"Your CampusNetwork account (@{u.username}) has been suspended by an administrator.\n"
                    f"Reason: {reason}\n\n— CampusNetwork (Cenet)"
                ),
                allow_formsubmit=True,
            )
            count += 1
        self.message_user(request, f"{count} account(s) suspended and notified.", messages.WARNING)

    @admin.action(description="Unsuspend (reinstate) selected accounts")
    def unsuspend_selected_users(self, request, queryset):
        n = queryset.update(is_active=True)
        self.message_user(request, f"{n} account(s) reinstated.", messages.SUCCESS)


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
    actions = ["approve_and_request_payment", "approve_without_payment", "reject_selected"]

    @admin.action(description="Approve data & send payment link (in-app + email)")
    def approve_and_request_payment(self, request, queryset):
        from django.conf import settings as _settings
        from .email_utils import send_platform_email
        frontend_base = (getattr(_settings, "FRONTEND_URL", "") or "https://campusnetwork-sooty.vercel.app").rstrip("/")
        pay_url = f"{frontend_base}/profile?tab=verification"
        count = 0
        for app in queryset:
            app.status = StudentVerificationApplication.Status.AWAITING_PAYMENT
            app.reviewed_by = request.user
            app.reviewed_at = timezone.now()
            app.payment_link = pay_url
            app.save()
            notify(
                app.user,
                notif_type=Notification.Type.VERIFICATION,
                text=(
                    "Your student verification documents have been approved! "
                    "Tap here to complete the ₦1,500 payment and activate your Verified Student badge."
                ),
                actor=request.user,
                link="/verification",
                dedupe_seconds=0,
            )
            send_platform_email(
                recipient_email=app.user.email,
                subject="CampusNetwork (Cenet): Verification Approved — Complete Payment to Activate",
                message=(
                    f"Hello {app.user.display_name},\n\n"
                    f"Your submitted student verification details have been reviewed and approved!\n\n"
                    f"Complete your ₦1,500 payment to activate your Verified Student badge:\n{pay_url}\n\n"
                    f"You can also pay inside the CampusNetwork app under Me -> Student Verification.\n\n"
                    f"— CampusNetwork (Cenet)"
                ),
                allow_formsubmit=True,
            )
            count += 1
        self.message_user(request, f"{count} application(s) approved — payment notification & email sent.", messages.SUCCESS)

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
