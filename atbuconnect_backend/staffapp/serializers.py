import re

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from config.security import validate_and_reencode_image

from .models import StaffApplication

_PHONE_RE = re.compile(r"^[0-9+()\-\s]{7,20}$")


class StaffApplicationSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)  # honeypot

    class Meta:
        model = StaffApplication
        fields = [
            "id", "first_name", "last_name", "email", "phone", "profile_picture",
            "profile_picture_url", "staff_id", "department", "academic_department_name",
            "role_title", "academic_references", "supporting_document", "liveness_video",
            "bio", "why", "status", "created_at", "review_note", "reviewed_at", "website",
        ]
        read_only_fields = ["id", "status", "created_at", "review_note", "reviewed_at", "profile_picture_url"]
        extra_kwargs = {
            "staff_id": {"required": False, "allow_blank": True},
            "supporting_document": {"required": False},
            "liveness_video": {"required": False},
        }

    def get_profile_picture_url(self, obj):
        if not obj.profile_picture:
            return None
        request = self.context.get("request")
        url = obj.profile_picture.url
        return request.build_absolute_uri(url) if request else url

    def validate_profile_picture(self, value):
        if not value:
            return value
        try:
            return validate_and_reencode_image(value, max_bytes=5 * 1024 * 1024, max_dim=1024)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])

    def validate_phone(self, value):
        value = (value or "").strip()
        if value and not _PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        return value

    def validate_email(self, value):
        from accounts.models import User
        value = value.strip()
        req = self.context.get("request")
        if req and req.user.is_authenticated and getattr(req.user, "is_verified_staff", False):
            raise serializers.ValidationError(
                "You already have Verified SUG status. Cancel your current SUG status first if you wish to re-apply."
            )
        if User.objects.filter(email__iexact=value, is_verified_staff=True).exists():
            raise serializers.ValidationError(
                "This account already has Verified SUG status. Cancel your current SUG status first if you wish to re-apply."
            )
        if StaffApplication.objects.filter(
            email__iexact=value, status=StaffApplication.Status.PENDING
        ).exists():
            raise serializers.ValidationError("An application with this email is already awaiting review.")
        return value

    def validate(self, attrs):
        if attrs.pop("website", ""):
            raise serializers.ValidationError({"detail": "Invalid submission."})
        for field in ("bio", "why"):
            if field in attrs and len(attrs[field].strip()) < 20:
                raise serializers.ValidationError({field: "Please write at least a couple of sentences."})
        return attrs


class StaffApplicationReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffApplication
        fields = ["status", "review_note"]
