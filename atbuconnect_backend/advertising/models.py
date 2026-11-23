import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL


def ad_creative_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"advertising/creatives/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        REJECTED = "rejected", "Rejected"
        COMPLETED = "completed", "Completed"

    class PaymentStatus(models.TextChoices):
        COMING_SOON = "coming_soon", "Payment Coming Soon"
        UNPAID = "unpaid", "Unpaid"
        PENDING = "pending", "Pending Verification"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"

    advertiser = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ad_campaigns")

    # Step 1: Ad content
    name = models.CharField(max_length=140)
    headline = models.CharField(max_length=160)
    description = models.TextField(max_length=1000)
    image = models.ImageField(upload_to=ad_creative_path, blank=True, null=True)
    destination_url = models.URLField(max_length=500, blank=True)
    cta_text = models.CharField(max_length=40, default="Learn More")

    # Step 2: Audience targeting
    targeting = models.JSONField(default=dict, blank=True)

    # Step 3: Placement & schedule
    placements = models.JSONField(default=list, blank=True)  # e.g. ["feed", "comments", "communities"]
    start_date = models.DateField()
    end_date = models.DateField()
    active_days = models.JSONField(default=list, blank=True)  # e.g. ["mon","tue",...]

    # Step 4: Budget (real pricing policy is admin-configurable; no fabricated guarantees)
    currency = models.CharField(max_length=8, default="NGN")
    total_budget = models.DecimalField(max_digits=12, decimal_places=2)
    daily_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    amount_spent = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Statuses (kept strictly separate: approval/delivery vs payment)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING, db_index=True)
    payment_status = models.CharField(
        max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.COMING_SOON
    )
    payment_reference = models.CharField(max_length=120, blank=True)

    # Moderation / Review
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_campaigns"
    )
    review_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"

    def is_eligible_to_serve(self, today=None) -> bool:
        today = today or timezone.localdate()
        if self.status != self.Status.ACTIVE:
            return False
        if today < self.start_date or today > self.end_date:
            return False
        if self.total_budget and self.amount_spent >= self.total_budget:
            return False
        if self.active_days:
            day_key = today.strftime("%a").lower()[:3]
            if day_key not in [str(d).lower()[:3] for d in self.active_days]:
                return False
        return True


class AdImpression(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="impressions")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    ip_hash = models.CharField(max_length=64, db_index=True)
    placement = models.CharField(max_length=32, default="feed")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "created_at"]),
            models.Index(fields=["campaign", "ip_hash", "created_at"]),
        ]


class AdClick(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="clicks")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    ip_hash = models.CharField(max_length=64, db_index=True)
    placement = models.CharField(max_length=32, default="feed")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "created_at"]),
            models.Index(fields=["campaign", "ip_hash", "created_at"]),
        ]


class PaymentTransaction(models.Model):
    """Audit-logged Paystack payment (Dedicated Virtual Account bank transfer or checkout)."""

    class Purpose(models.TextChoices):
        AD_CAMPAIGN = "ad_campaign", "Ad Campaign"
        STUDENT_VERIFICATION = "student_verification", "Student Verification (₦1,500)"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payment_transactions")
    purpose = models.CharField(max_length=32, choices=Purpose.choices, db_index=True)
    campaign = models.ForeignKey(
        Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name="payment_transactions"
    )
    amount_ngn = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=120, unique=True, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider = models.CharField(max_length=24, default="paystack")
    paystack_customer_code = models.CharField(max_length=80, blank=True)
    virtual_account_bank = models.CharField(max_length=80, blank=True)
    virtual_account_number = models.CharField(max_length=32, blank=True)
    virtual_account_name = models.CharField(max_length=120, blank=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    raw_webhook = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} — {self.purpose} ₦{self.amount_ngn} ({self.status})"
