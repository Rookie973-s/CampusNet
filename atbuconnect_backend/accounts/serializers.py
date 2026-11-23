import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from config.security import validate_and_reencode_image
from departments.serializers import DepartmentSerializer

from .entitlements import can_change_username, get_entitlements
from .models import SUGRating, StudentVerificationApplication

User = get_user_model()

_PHONE_RE = re.compile(r"^[0-9+()\-\s]{7,20}$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
_RESERVED_USERNAMES = {"admin", "administrator", "root", "support", "campusnetwork", "cenet", "sug", "staff", "system"}


def _abs_url(request, file_field):
    if not file_field:
        return None
    try:
        url = file_field.url
    except Exception:
        return None
    return request.build_absolute_uri(url) if request else url


def normalize_phone(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    # Normalize spaces/dashes while keeping leading + if present
    lead = "+" if raw.startswith("+") else ""
    digits = re.sub(r"\D+", "", raw)
    return f"{lead}{digits}" if digits else ""


class UserPublicSerializer(serializers.ModelSerializer):
    """Lightweight representation embedded on questions, comments, mentions, search, and chat."""

    name = serializers.CharField(source="display_name", read_only=True)
    av = serializers.CharField(source="initials", read_only=True)
    bg = serializers.CharField(source="avatar_bg", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    staff = serializers.BooleanField(source="is_verified_staff", read_only=True)
    is_verified_student = serializers.BooleanField(read_only=True)
    dept = serializers.CharField(source="department.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "id", "username", "name", "av", "bg", "avatar_url",
            "staff", "is_verified_student", "dept",
        ]

    def get_avatar_url(self, obj):
        return _abs_url(self.context.get("request"), obj.profile_picture)


class SUGRatingSerializer(serializers.ModelSerializer):
    rater = UserPublicSerializer(read_only=True)

    class Meta:
        model = SUGRating
        fields = ["id", "sug", "rater", "score", "comment", "created_at", "updated_at"]
        read_only_fields = ["id", "sug", "rater", "created_at", "updated_at"]


class StaffDirectorySerializer(serializers.ModelSerializer):
    """Full SUG/staff-card shape used by StaffPage.jsx."""

    name = serializers.CharField(source="display_name", read_only=True)
    av = serializers.CharField(source="initials", read_only=True)
    bg = serializers.CharField(source="avatar_bg", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    role = serializers.CharField(source="title", read_only=True)
    dept = serializers.CharField(source="department.name", read_only=True, default=None)
    online = serializers.BooleanField(source="is_online", read_only=True)
    answers = serializers.IntegerField(source="answers_count", read_only=True)
    sug_rating = serializers.FloatField(read_only=True)
    sug_ratings_count = serializers.IntegerField(read_only=True)
    my_sug_rating = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "name", "av", "bg", "avatar_url", "role", "dept", "online",
            "rating", "sug_rating", "sug_ratings_count", "my_sug_rating",
            "answers", "bio", "email", "phone",
        ]

    def get_avatar_url(self, obj):
        return _abs_url(self.context.get("request"), obj.profile_picture)

    def get_my_sug_rating(self, obj):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        if not (u and u.is_authenticated):
            return None
        row = obj.received_sug_ratings.filter(rater=u).first()
        return row.score if row else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not (request and request.user and request.user.is_authenticated):
            data.pop("email", None)
            data.pop("phone", None)
        return data


class MeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)
    av = serializers.CharField(source="initials", read_only=True)
    bg = serializers.CharField(source="avatar_bg", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    dept = DepartmentSerializer(source="department", read_only=True)
    questions = serializers.IntegerField(source="questions_count", read_only=True)
    answers = serializers.IntegerField(source="answers_count", read_only=True)
    followers = serializers.SerializerMethodField()
    following = serializers.SerializerMethodField()
    has_usable_password = serializers.SerializerMethodField()
    entitlements = serializers.SerializerMethodField()
    can_change_username = serializers.SerializerMethodField()
    next_username_change_at = serializers.SerializerMethodField()
    sug_rating = serializers.FloatField(read_only=True)
    sug_ratings_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "name",
            "av", "bg", "avatar_url", "role", "phone", "phone_number", "bio", "dept",
            "matric_number", "level", "staff_id", "title", "is_verified_staff",
            "is_verified_student", "email_verified", "hide_ads", "has_usable_password",
            "username_changed_at", "can_change_username", "next_username_change_at",
            "entitlements", "questions", "answers", "followers", "following",
            "sug_rating", "sug_ratings_count", "language",
        ]
        read_only_fields = [
            "id", "email", "role", "is_verified_staff", "is_verified_student",
            "email_verified", "staff_id", "title", "username_changed_at",
        ]

    def get_avatar_url(self, obj):
        return _abs_url(self.context.get("request"), obj.profile_picture)

    def get_followers(self, obj):
        return obj.followers_set.count()

    def get_following(self, obj):
        return obj.following_set.count()

    def get_has_usable_password(self, obj):
        return obj.has_usable_password()

    def get_entitlements(self, obj):
        return get_entitlements(obj)

    def get_can_change_username(self, obj):
        ok, _ = can_change_username(obj)
        return ok

    def get_next_username_change_at(self, obj):
        _, nxt = can_change_username(obj)
        return nxt.isoformat() if nxt else None

    def validate_username(self, value):
        value = (value or "").strip()
        if self.instance and value == self.instance.username:
            return value
        if not _USERNAME_RE.match(value):
            raise serializers.ValidationError("Username must be 3-30 characters (letters, numbers, _, ., -).")
        if value.lower() in _RESERVED_USERNAMES:
            raise serializers.ValidationError("That username is reserved.")
        if User.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is already taken.")
        if self.instance:
            allowed, next_at = can_change_username(self.instance)
            if not allowed:
                raise serializers.ValidationError(
                    f"You can change your username again on {next_at.strftime('%d %b %Y')} (verified students can change anytime)."
                )
        return value

    def validate_phone_number(self, value):
        norm = normalize_phone(value)
        if not norm:
            return None
        if not _PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        qs = User.objects.filter(phone_number=norm)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This phone number is already linked to another account.")
        return norm

    def validate_hide_ads(self, value):
        if value and self.instance and not get_entitlements(self.instance)["can_hide_ads"]:
            raise serializers.ValidationError("Only verified students can turn off advertisements.")
        return value

    def validate_matric_number(self, value):
        value = (value or "").strip()
        current = getattr(self.instance, "matric_number", "") if self.instance else ""
        if current and value != current:
            raise serializers.ValidationError(
                "Your matric number is locked. Contact support if it is wrong."
            )
        return value

    def update(self, instance, validated_data):
        from django.utils import timezone
        new_username = validated_data.get("username")
        if new_username and new_username != instance.username:
            instance.username_changed_at = timezone.now()
        if "phone_number" in validated_data and validated_data["phone_number"]:
            validated_data.setdefault("phone", validated_data["phone_number"])
        return super().update(instance, validated_data)


class PublicProfileSerializer(serializers.ModelSerializer):
    """Public profile card shown when clicking any user/commenter/mention."""

    name = serializers.CharField(source="display_name", read_only=True)
    av = serializers.CharField(source="initials", read_only=True)
    bg = serializers.CharField(source="avatar_bg", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    dept = serializers.CharField(source="department.name", read_only=True, default=None)
    staff = serializers.BooleanField(source="is_verified_staff", read_only=True)
    is_verified_student = serializers.BooleanField(read_only=True)
    title = serializers.CharField(read_only=True)
    questions = serializers.IntegerField(source="questions_count", read_only=True)
    answers = serializers.IntegerField(source="answers_count", read_only=True)
    followers = serializers.SerializerMethodField()
    following = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    is_me = serializers.SerializerMethodField()
    sug_rating = serializers.FloatField(read_only=True)
    sug_ratings_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "name", "av", "bg", "avatar_url", "dept", "staff",
            "is_verified_student", "title", "bio", "questions", "answers",
            "followers", "following", "is_following", "is_me",
            "sug_rating", "sug_ratings_count",
        ]

    def get_avatar_url(self, obj):
        return _abs_url(self.context.get("request"), obj.profile_picture)

    def get_followers(self, obj):
        return obj.followers_set.count()

    def get_following(self, obj):
        return obj.following_set.count()

    def _viewer(self):
        request = self.context.get("request")
        u = getattr(request, "user", None)
        return u if (u and u.is_authenticated) else None

    def get_is_following(self, obj):
        v = self._viewer()
        return bool(v and v.pk != obj.pk and obj.followers_set.filter(follower=v).exists())

    def get_is_me(self, obj):
        v = self._viewer()
        return bool(v and v.pk == obj.pk)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    username = serializers.CharField(required=True, allow_blank=False)
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)  # honeypot

    class Meta:
        model = User
        fields = [
            "username", "email", "first_name", "last_name", "password",
            "confirm_password", "phone_number", "phone", "matric_number",
            "level", "department", "website",
        ]

    def validate_username(self, value):
        uname = (value or "").strip()
        if not uname:
            raise serializers.ValidationError("Please choose a username.")
        if not _USERNAME_RE.match(uname):
            raise serializers.ValidationError(
                "Username must be 3–30 characters using only letters, numbers, underscores, dots, or hyphens."
            )
        if uname.lower() in _RESERVED_USERNAMES:
            raise serializers.ValidationError("That username is reserved. Please choose another.")
        if User.objects.filter(username__iexact=uname).exists():
            raise serializers.ValidationError("This username is already taken. Please choose a different username.")
        return uname

    def validate(self, attrs):
        if attrs.pop("website", ""):
            raise serializers.ValidationError({"detail": "Invalid submission."})
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        raw_phone = attrs.get("phone_number") or attrs.get("phone") or ""
        norm_phone = normalize_phone(raw_phone)
        if raw_phone:
            if not _PHONE_RE.match(raw_phone.strip()) or len(re.sub(r"\D+", "", raw_phone)) < 7:
                raise serializers.ValidationError({"phone_number": "Enter a valid phone number."})
            if User.objects.filter(phone_number=norm_phone).exists():
                raise serializers.ValidationError({"phone_number": "An account with this phone number already exists."})
            attrs["phone_number"] = norm_phone
            attrs["phone"] = raw_phone.strip()
        else:
            attrs["phone_number"] = None
        return attrs

    def validate_email(self, value):
        value = (value or "").strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data, role=User.Role.STUDENT)
        user.set_password(password)
        user.save()
        return user


class StudentVerificationApplicationSerializer(serializers.ModelSerializer):
    user_info = UserPublicSerializer(source="user", read_only=True)
    faculty_name = serializers.CharField(source="faculty.name", read_only=True, default=None)
    has_document = serializers.SerializerMethodField()
    has_liveness_video = serializers.SerializerMethodField()

    class Meta:
        model = StudentVerificationApplication
        fields = [
            "id", "user", "user_info", "faculty", "faculty_name", "department",
            "department_name", "level", "matric_number", "reason", "supporting_document",
            "liveness_video", "has_document", "has_liveness_video", "is_renewal",
            "status", "payment_link", "review_note",
            "created_at", "reviewed_at", "consent",
        ]
        read_only_fields = [
            "id", "user", "user_info", "is_renewal", "status", "payment_link", "review_note",
            "created_at", "reviewed_at",
        ]
        extra_kwargs = {
            "supporting_document": {"write_only": True, "required": False},
            "liveness_video": {"write_only": True, "required": False},
            "matric_number": {"required": False, "allow_blank": True},
        }

    def get_has_document(self, obj):
        return bool(obj.supporting_document)

    def get_has_liveness_video(self, obj):
        return bool(obj.liveness_video)

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("You must consent to the verification process and privacy policy.")
        return value

    def validate_liveness_video(self, f):
        if not f:
            return f
        if f.size > 25 * 1024 * 1024:
            raise serializers.ValidationError("Liveness scan video must be under 25 MB.")
        return f

    def validate_supporting_document(self, f):
        if not f:
            return f
        if f.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Supporting document must be under 10 MB.")
        name = (f.name or "").lower()
        if name.endswith((".jpg", ".jpeg", ".png", ".webp")):
            try:
                return validate_and_reencode_image(f, max_bytes=10 * 1024 * 1024, max_dim=1800)
            except DjangoValidationError as e:
                raise serializers.ValidationError(e.messages[0])
        if not name.endswith(".pdf"):
            raise serializers.ValidationError("Upload an image (JPG/PNG/WebP) or PDF document.")
        return f
