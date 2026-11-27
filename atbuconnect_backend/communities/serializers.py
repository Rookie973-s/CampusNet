from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.timesince import timesince
from rest_framework import serializers

from accounts.serializers import UserPublicSerializer
from config.security import sanitize_rich_html, strip_html_to_text, validate_and_reencode_image

from .models import Community, CommunityMembership, CommunityPost, CommunityPostComment


def _abs(request, file_field):
    if not file_field:
        return None
    try:
        url = file_field.url
    except Exception:
        return None
    abs_url = request.build_absolute_uri(url) if request else url
    if abs_url.startswith("http://") and not any(h in abs_url for h in ("127.0.0.1", "localhost")):
        abs_url = "https://" + abs_url[len("http://"):]
    return abs_url


class CommunitySerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    creator_info = UserPublicSerializer(source="creator", read_only=True)
    followers_count = serializers.SerializerMethodField()
    posts_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()
    notif_level = serializers.SerializerMethodField()
    can_publish = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    last_activity = serializers.SerializerMethodField()

    class Meta:
        model = Community
        fields = [
            "id", "name", "slug", "description", "category", "accent_color",
            "visibility", "rules", "is_official", "avatar", "cover_image",
            "avatar_url", "cover_url", "creator_info", "followers_count",
            "posts_count", "is_following", "my_role", "notif_level",
            "can_publish", "can_manage", "last_activity", "created_at",
        ]
        read_only_fields = ["id", "is_official", "created_at"]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
            "avatar": {"write_only": True, "required": False},
            "cover_image": {"write_only": True, "required": False},
        }

    def _viewer(self):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        return u if (u and u.is_authenticated) else None

    def _membership(self, obj):
        u = self._viewer()
        if not u:
            return None
        cache = getattr(obj, "_viewer_membership_cache", None)
        if cache is not None and cache[0] == u.pk:
            return cache[1]
        m = obj.memberships.filter(user=u).first()
        obj._viewer_membership_cache = (u.pk, m)
        return m

    def get_avatar_url(self, obj):
        return _abs(self.context.get("request"), obj.avatar)

    def get_cover_url(self, obj):
        return _abs(self.context.get("request"), obj.cover_image)

    def get_followers_count(self, obj):
        return getattr(obj, "n_followers", None) if hasattr(obj, "n_followers") else obj.memberships.count()

    def get_posts_count(self, obj):
        return getattr(obj, "n_posts", None) if hasattr(obj, "n_posts") else obj.posts.count()

    def get_is_following(self, obj):
        return self._membership(obj) is not None

    def get_my_role(self, obj):
        m = self._membership(obj)
        return m.role if m else None

    def get_notif_level(self, obj):
        m = self._membership(obj)
        return m.notif_level if m else None

    def get_can_publish(self, obj):
        u = self._viewer()
        if not u:
            return False
        if u.is_superuser or getattr(u, "role", None) == "admin":
            return True
        m = self._membership(obj)
        return bool(m and m.can_publish())

    def get_can_manage(self, obj):
        u = self._viewer()
        if not u:
            return False
        if u.is_superuser or getattr(u, "role", None) == "admin":
            return True
        m = self._membership(obj)
        return bool(m and m.can_manage())

    def get_last_activity(self, obj):
        latest = obj.posts.order_by("-created_at").values_list("created_at", flat=True).first()
        if not latest:
            return None
        return f"{timesince(latest).split(',')[0]} ago"

    def validate_name(self, v):
        v = (v or "").strip()
        if len(v) < 3:
            raise serializers.ValidationError("Community name must be at least 3 characters.")
        return v

    def validate_avatar(self, f):
        if not f:
            return f
        try:
            return validate_and_reencode_image(f, max_bytes=5 * 1024 * 1024, max_dim=512)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])

    def validate_cover_image(self, f):
        if not f:
            return f
        try:
            return validate_and_reencode_image(f, max_bytes=8 * 1024 * 1024, max_dim=1600)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])


class CommunityMemberSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(read_only=True)

    class Meta:
        model = CommunityMembership
        fields = ["id", "user", "role", "notif_level", "joined_at"]


class CommunityPostCommentSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(source="author", read_only=True)
    time = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = CommunityPostComment
        fields = ["id", "post", "parent", "user", "body", "body_html", "time", "created_at", "replies"]
        read_only_fields = ["id", "post", "user", "time", "created_at", "replies"]

    def get_time(self, obj):
        return f"{timesince(obj.created_at).split(',')[0]} ago"

    def get_replies(self, obj):
        if obj.parent_id is not None:
            return []
        qs = obj.replies.select_related("author", "author__department").order_by("created_at")
        return CommunityPostCommentSerializer(qs, many=True, context=self.context).data


class CommunityPostSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(source="author", read_only=True)
    image_url = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()
    likes = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = CommunityPost
        fields = [
            "id", "community", "user", "title", "body", "body_html", "is_important",
            "image", "image_url", "time", "likes", "liked", "comments_count",
            "can_manage", "created_at", "edited_at",
        ]
        read_only_fields = ["id", "community", "user", "time", "created_at", "edited_at"]
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def get_image_url(self, obj):
        return _abs(self.context.get("request"), obj.image)

    def get_time(self, obj):
        return f"{timesince(obj.created_at).split(',')[0]} ago"

    def get_likes(self, obj):
        return obj.likes_set.count()

    def get_liked(self, obj):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        return bool(u and u.is_authenticated and obj.likes_set.filter(user=u).exists())

    def get_comments_count(self, obj):
        return obj.comments.count()

    def get_can_manage(self, obj):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        if not (u and u.is_authenticated):
            return False
        if u.is_superuser or getattr(u, "role", None) == "admin" or obj.author_id == u.pk:
            return True
        return CommunityMembership.objects.filter(
            community_id=obj.community_id,
            user=u,
            role__in=[CommunityMembership.Role.OWNER, CommunityMembership.Role.ADMIN],
        ).exists()

    def validate_image(self, f):
        if not f:
            return f
        try:
            return validate_and_reencode_image(f, max_bytes=8 * 1024 * 1024, max_dim=1600)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages[0])

    def validate(self, attrs):
        body_html = attrs.get("body_html", "")
        if body_html:
            clean = sanitize_rich_html(body_html)
            attrs["body_html"] = clean
            if not attrs.get("body"):
                attrs["body"] = strip_html_to_text(clean)
        body = (attrs.get("body") or "").strip()
        if not body:
            raise serializers.ValidationError({"body": "Post content cannot be empty."})
        attrs["body"] = body
        return attrs
