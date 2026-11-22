from django.contrib import admin, messages

from . import services
from .models import StaffApplication


@admin.register(StaffApplication)
class StaffApplicationAdmin(admin.ModelAdmin):
    list_display = ["first_name", "last_name", "email", "department", "status", "created_at", "reviewed_by"]
    list_filter = ["status", "department"]
    search_fields = ["first_name", "last_name", "email", "staff_id"]
    # Decisions go through the actions below (so grants, notification and email always
    # happen together); the status and audit fields can't be edited by hand.
    readonly_fields = ["status", "reviewed_by", "reviewed_at", "created_at"]
    autocomplete_fields = ["linked_user"]
    actions = ["approve_selected", "reject_selected"]

    def _bulk(self, request, queryset, approve):
        done = skipped = 0
        for app in queryset:
            try:
                services.review_application(app.pk, request.user, approve, app.review_note)
                done += 1
            except services.AlreadyReviewed:
                skipped += 1
            except PermissionError:
                self.message_user(request, "You don't have permission to review applications.", messages.ERROR)
                return
        if done:
            self.message_user(request, f"{done} application(s) {'approved' if approve else 'rejected'}.", messages.SUCCESS)
        if skipped:
            self.message_user(request, f"{skipped} already reviewed — left unchanged.", messages.WARNING)

    @admin.action(description="Approve selected SUG access applications")
    def approve_selected(self, request, queryset):
        self._bulk(request, queryset, True)

    @admin.action(description="Reject selected SUG access applications")
    def reject_selected(self, request, queryset):
        self._bulk(request, queryset, False)
