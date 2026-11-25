from decimal import Decimal
import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from config.security import validate_and_reencode_image

from .models import Campaign


class CampaignSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    advertiser_name = serializers.CharField(source="advertiser.display_name", read_only=True)
    impressions_count = serializers.SerializerMethodField()
    clicks_count = serializers.SerializerMethodField()
    ctr = serializers.SerializerMethodField()
    remaining_budget = serializers.SerializerMethodField()
    duration_days = serializers.SerializerMethodField()
    payment_gateway_status = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id", "advertiser", "advertiser_name", "name", "headline", "description",
            "image", "image_url", "destination_url", "cta_text",
            "targeting", "placements", "start_date", "end_date", "active_days",
            "currency", "total_budget", "daily_budget", "amount_spent", "remaining_budget",
            "duration_days", "status", "payment_status", "payment_gateway_status",
            "review_note", "reviewed_at", "impressions_count", "clicks_count", "ctr",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "advertiser", "advertiser_name", "amount_spent", "status",
            "payment_status", "review_note", "reviewed_at", "created_at", "updated_at",
        ]
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def to_internal_value(self, data):
        # Support JSON-encoded fields when submitted via multipart/form-data.
        # Convert QueryDict to a plain dict so DRF's JSONField does not treat
        # already-parsed dict/list values as raw HTML form strings and fail.
        if hasattr(data, "dict"):
            mutable = data.dict()
        else:
            mutable = dict(data)
        # Accept headline/title fallback for name so mobile/web forms never trip on missing name
        if not mutable.get("name") and (mutable.get("headline") or mutable.get("title")):
            mutable["name"] = str(mutable.get("headline") or mutable.get("title"))[:120]
        if not mutable.get("headline") and mutable.get("title"):
            mutable["headline"] = str(mutable.get("title"))[:140]
        for key in ("targeting", "placements", "active_days"):
            val = mutable.get(key)
            if isinstance(val, str):
                stripped = val.strip()
                if not stripped:
                    mutable[key] = {} if key == "targeting" else []
                else:
                    try:
                        mutable[key] = json.loads(stripped)
                    except Exception:
                        pass
        return super().to_internal_value(mutable)

    def get_image_url(self, obj):
        if not obj.image:
            return None
        req = self.context.get("request")
        url = obj.image.url
        return req.build_absolute_uri(url) if req else url

    def get_impressions_count(self, obj):
        return getattr(obj, "n_impressions", None) if hasattr(obj, "n_impressions") else obj.impressions.count()

    def get_clicks_count(self, obj):
        return getattr(obj, "n_clicks", None) if hasattr(obj, "n_clicks") else obj.clicks.count()

    def get_ctr(self, obj):
        imp = self.get_impressions_count(obj)
        clk = self.get_clicks_count(obj)
        if not imp:
            return 0.0
        return round((clk / imp) * 100, 2)

    def get_remaining_budget(self, obj):
        rem = (obj.total_budget or Decimal("0.00")) - (obj.amount_spent or Decimal("0.00"))
        return str(max(Decimal("0.00"), rem))

    def get_duration_days(self, obj):
        if obj.start_date and obj.end_date:
            return max(1, (obj.end_date - obj.start_date).days + 1)
        return 1

    def get_payment_gateway_status(self, obj):
        from .payments import get_payment_gateway
        return "paystack_live" if get_payment_gateway().is_enabled() else "coming_soon"

    def validate_image(self, f):
        if not f:
            return f
        try:
            return validate_and_reencode_image(f, max_bytes=8 * 1024 * 1024, max_dim=1600)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])

    def validate_destination_url(self, v):
        v = (v or "").strip()
        if v and not (v.startswith("https://") or v.startswith("http://")):
            raise serializers.ValidationError("Destination URL must start with https:// or http://.")
        return v

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})
        if self.instance is None and start and start < timezone.localdate():
            raise serializers.ValidationError({"start_date": "Start date cannot be in the past."})

        budget = attrs.get("total_budget", getattr(self.instance, "total_budget", None))
        if budget is not None and budget <= 0:
            raise serializers.ValidationError({"total_budget": "Total budget must be greater than zero."})
        # Server-authoritative dynamic ad pricing capped at NGN 4,000 for non-admin advertisers
        req = self.context.get("request")
        is_admin = bool(req and req.user.is_authenticated and (req.user.is_superuser or getattr(req.user, "role", "") == "admin"))
        if start and end and not is_admin:
            from .payments import MAX_AD_PRICE_NGN, calculate_ad_price
            est = calculate_ad_price(
                start,
                end,
                targeting=attrs.get("targeting", getattr(self.instance, "targeting", {})),
                placements=attrs.get("placements", getattr(self.instance, "placements", ["feed"])),
            )
            attrs["total_budget"] = min(Decimal(est["amount_ngn"]), MAX_AD_PRICE_NGN)
        elif budget is not None and budget > Decimal("5000.00") and not is_admin:
            raise serializers.ValidationError({
                "total_budget": "Maximum campaign price cannot exceed ₦5,000."
            })

        daily = attrs.get("daily_budget", getattr(self.instance, "daily_budget", None))
        if daily is not None and daily <= 0:
            raise serializers.ValidationError({"daily_budget": "Daily budget must be greater than zero."})
        eff_budget = attrs.get("total_budget", budget)
        if eff_budget is not None and daily is not None and daily > eff_budget:
            attrs["daily_budget"] = eff_budget

        placements = attrs.get("placements")
        if placements is not None and not isinstance(placements, list):
            raise serializers.ValidationError({"placements": "Placements must be a list."})
        return attrs


class ServedAdSerializer(serializers.ModelSerializer):
    """Public ad shape served to feed/library/comments — never leaks advertiser budget or private data."""
    image_url = serializers.SerializerMethodField()
    advertiser_name = serializers.CharField(source="advertiser.display_name", read_only=True)

    class Meta:
        model = Campaign
        fields = ["id", "headline", "description", "image_url", "destination_url", "cta_text", "placements", "advertiser_name"]

    def get_image_url(self, obj):
        if not obj.image:
            return None
        req = self.context.get("request")
        url = obj.image.url
        abs_url = req.build_absolute_uri(url) if req else url
        if abs_url.startswith("http://") and "onrender.com" in abs_url:
            abs_url = "https://" + abs_url[len("http://"):]
        return abs_url
