from django.contrib import admin, messages
from django.utils import timezone

from .models import AdClick, AdImpression, AuditLog, Campaign, PaymentTransaction


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = [
        "name", "advertiser", "status", "payment_status",
        "total_budget", "start_date", "end_date", "created_at",
    ]
    list_filter = ["status", "payment_status", "start_date"]
    search_fields = ["name", "headline", "advertiser__username", "advertiser__email"]
    actions = ["approve_campaigns", "pause_campaigns"]

    @admin.action(description="Approve selected ad campaigns")
    def approve_campaigns(self, request, queryset):
        today = timezone.localdate()
        count = 0
        for camp in queryset:
            camp.status = Campaign.Status.ACTIVE if camp.start_date <= today <= camp.end_date else Campaign.Status.SCHEDULED
            camp.reviewed_by = request.user
            camp.reviewed_at = timezone.now()
            camp.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
            count += 1
        self.message_user(request, f"{count} campaign(s) approved.", messages.SUCCESS)

    @admin.action(description="Pause selected ad campaigns")
    def pause_campaigns(self, request, queryset):
        n = queryset.update(status=Campaign.Status.PAUSED)
        self.message_user(request, f"{n} campaign(s) paused.", messages.WARNING)


@admin.register(AdImpression)
class AdImpressionAdmin(admin.ModelAdmin):
    list_display = ["campaign", "user", "placement", "created_at"]


@admin.register(AdClick)
class AdClickAdmin(admin.ModelAdmin):
    list_display = ["campaign", "user", "placement", "created_at"]


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "reference", "user", "purpose", "amount_ngn", "status",
        "virtual_account_bank", "virtual_account_number", "paid_at", "created_at",
    ]
    list_filter = ["purpose", "status", "provider"]
    search_fields = ["reference", "user__username", "user__email", "virtual_account_number"]
    readonly_fields = ["raw_webhook", "created_at", "updated_at"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["action", "actor", "target_type", "target_id", "created_at"]
    list_filter = ["action", "target_type"]
    search_fields = ["action", "target_id", "actor__username"]
    readonly_fields = ["actor", "action", "target_type", "target_id", "metadata", "ip_hash", "created_at"]
