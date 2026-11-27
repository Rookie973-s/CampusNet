from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.timesince import timesince
from rest_framework import serializers

from accounts.entitlements import get_entitlements
from accounts.serializers import UserPublicSerializer
from config.security import sanitize_rich_html, strip_html_to_text, validate_and_reencode_image

from . import media_validation as mv
from .models import Answer, AnswerVote, PollOption, Question, QuestionMedia, Tag


def human_time(dt):
    return f"{timesince(dt).split(',')[0]} ago"


class TagField(serializers.SlugRelatedField):
    """Lets clients read/write tags as a flat list of strings, e.g. ["MTH201","Exams"]."""

    def to_internal_value(self, data):
        tag, _ = Tag.objects.get_or_create(name=data.strip())
        return tag


class AnswerSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(source="author", read_only=True)
    time = serializers.SerializerMethodField()
    likes = serializers.IntegerField(read_only=True)
    liked = serializers.SerializerMethodField()
    upvotes = serializers.SerializerMethodField()
    downvotes = serializers.SerializerMethodField()
    my_vote = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    myReactions = serializers.SerializerMethodField()

    class Meta:
        model = Answer
        fields = [
            "id", "question", "parent", "user", "body", "body_html", "image_url",
            "time", "created_at", "likes", "liked", "upvotes", "downvotes", "my_vote",
            "can_delete", "replies", "reactions", "myReactions",
        ]
        read_only_fields = [
            "id", "question", "user", "time", "created_at", "likes",
            "upvotes", "downvotes", "my_vote", "image_url", "can_delete", "replies",
        ]

    def get_time(self, obj):
        return human_time(obj.created_at)

    def _user(self):
        request = self.context.get("request")
        u = getattr(request, "user", None)
        return u if (u and u.is_authenticated) else None

    def get_liked(self, obj):
        user = self._user()
        return bool(user and obj.likes_set.filter(user=user).exists())

    def get_upvotes(self, obj):
        if hasattr(obj, "n_upvotes") and obj.n_upvotes is not None:
            return obj.n_upvotes
        return obj.votes_set.filter(direction=AnswerVote.UP).count()

    def get_downvotes(self, obj):
        if hasattr(obj, "n_downvotes") and obj.n_downvotes is not None:
            return obj.n_downvotes
        return obj.votes_set.filter(direction=AnswerVote.DOWN).count()

    def get_my_vote(self, obj):
        user = self._user()
        if not user:
            return None
        row = obj.votes_set.filter(user=user).first()
        return row.direction if row else None

    def get_image_url(self, obj):
        if not obj.image:
            return None
        req = self.context.get("request")
        url = obj.image.url
        abs_url = req.build_absolute_uri(url) if req else url
        if abs_url.startswith("http://") and not any(h in abs_url for h in ("127.0.0.1", "localhost")):
            abs_url = "https://" + abs_url[len("http://"):]
        return abs_url

    def get_can_delete(self, obj):
        from .permissions import is_moderator
        user = self._user()
        return bool(user and (obj.author_id == user.id or is_moderator(user)))

    def get_replies(self, obj):
        depth = self.context.get("_depth", 0)
        if depth >= 3:
            return []
        qs = obj.replies.select_related("author", "author__department").order_by("created_at")
        child_ctx = {**self.context, "_depth": depth + 1}
        return AnswerSerializer(qs, many=True, context=child_ctx).data

    def get_reactions(self, obj):
        return obj.reaction_counts()

    def get_myReactions(self, obj):
        user = self._user()
        if not user:
            return {}
        kinds = obj.reactions.filter(user=user).values_list("kind", flat=True)
        return {k: True for k in kinds}


class QuestionMediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = QuestionMedia
        fields = ["id", "kind", "url", "width", "height", "duration"]

    def get_url(self, obj):
        request = self.context.get("request")
        url = obj.file.url
        abs_url = request.build_absolute_uri(url) if request else url
        if abs_url.startswith("http://") and not any(h in abs_url for h in ("127.0.0.1", "localhost")):
            abs_url = "https://" + abs_url[len("http://"):]
        return abs_url


class QuestionListSerializer(serializers.ModelSerializer):
    """Compact shape matching FeedPage.jsx q-card usage."""

    user = UserPublicSerializer(source="author", read_only=True)
    dept = serializers.CharField(source="department.name", read_only=True, default=None)
    tags = TagField(many=True, slug_field="name", queryset=Tag.objects.all())
    time = serializers.SerializerMethodField()
    votes = serializers.IntegerField(read_only=True)
    likes = serializers.IntegerField(read_only=True)
    ans = serializers.IntegerField(source="ans_count", read_only=True)
    answered = serializers.BooleanField(source="is_answered", read_only=True)
    voted = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()
    media = QuestionMediaSerializer(many=True, read_only=True)
    promoted = serializers.BooleanField(read_only=True)
    can_delete = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    delete_deadline = serializers.SerializerMethodField()
    poll_options = serializers.SerializerMethodField()
    poll_total_votes = serializers.SerializerMethodField()
    my_poll_option = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id", "public_id", "user", "dept", "title", "body", "body_html", "tags", "time",
            "votes", "likes", "ans", "views", "answered",
            "voted", "liked", "saved", "media", "promoted",
            "can_delete", "can_edit", "delete_deadline",
            "poll_options", "poll_total_votes", "my_poll_option",
            "created_at", "edited_at",
        ]
        read_only_fields = [
            "id", "public_id", "votes", "likes", "ans", "views", "answered",
            "poll_options", "poll_total_votes", "my_poll_option", "created_at", "edited_at",
        ]

    def get_can_delete(self, obj):
        from .permissions import can_delete_question
        user = self._user()
        return bool(user and can_delete_question(user, obj))

    def get_can_edit(self, obj):
        from .permissions import can_edit_question
        user = self._user()
        return bool(user and can_edit_question(user, obj))

    def get_delete_deadline(self, obj):
        user = self._user()
        if user and obj.author_id == user.id:
            if get_entitlements(user)["can_delete_own_posts_anytime"]:
                return None  # no expiry for verified students
            return obj.owner_delete_deadline.isoformat()
        return None

    def get_time(self, obj):
        return human_time(obj.created_at)

    def _user(self):
        request = self.context.get("request")
        u = getattr(request, "user", None)
        return u if (u and u.is_authenticated) else None

    def get_voted(self, obj):
        user = self._user()
        if not user:
            return None
        row = obj.votes_set.filter(user=user).first()
        return row.direction if row else None

    def get_liked(self, obj):
        user = self._user()
        return bool(user and obj.likes_set.filter(user=user).exists())

    def get_saved(self, obj):
        user = self._user()
        return bool(user and obj.bookmarks.filter(user=user).exists())

    def get_poll_options(self, obj):
        opts = list(obj.poll_options.all())
        if not opts:
            return []
        total = obj.poll_votes.count()
        user = self._user()
        my_opt_id = None
        if user:
            v = obj.poll_votes.filter(user=user).first()
            my_opt_id = v.option_id if v else None
        out = []
        for o in opts:
            c = o.votes.count()
            pct = round((c / total) * 100) if total else 0
            out.append({
                "id": o.id,
                "text": o.text,
                "votes": c,
                "percent": pct,
                "voted": o.id == my_opt_id,
            })
        return out

    def get_poll_total_votes(self, obj):
        if not obj.poll_options.exists():
            return 0
        return obj.poll_votes.count()

    def get_my_poll_option(self, obj):
        user = self._user()
        if not user or not obj.poll_options.exists():
            return None
        v = obj.poll_votes.filter(user=user).first()
        return v.option_id if v else None


class QuestionDetailSerializer(QuestionListSerializer):
    answers = serializers.SerializerMethodField()

    class Meta(QuestionListSerializer.Meta):
        fields = QuestionListSerializer.Meta.fields + ["answers"]

    def get_answers(self, obj):
        # Return top-level comments with nested replies
        top_level = obj.answers.filter(parent__isnull=True).select_related("author", "author__department").order_by("-created_at")
        return AnswerSerializer(top_level, many=True, context={**self.context, "_depth": 0}).data


def _validate_post_length(user, body_text: str):
    ent = get_entitlements(user)
    words = len([w for w in (body_text or "").split() if w])
    if words > ent["max_post_words"]:
        raise serializers.ValidationError({
            "body": (
                f"Post exceeds your word limit of {ent['max_post_words']} words "
                f"({words} words written). Verified students can post up to 1,200 words."
            )
        })
    if len(body_text or "") > ent["max_post_chars"]:
        raise serializers.ValidationError({
            "body": f"Post exceeds maximum length of {ent['max_post_chars']} characters."
        })


class QuestionCreateSerializer(serializers.ModelSerializer):
    """Create a post: text + optional rich formatting + up to 6 images OR one video."""

    tags = TagField(many=True, slug_field="name", queryset=Tag.objects.all(), required=False)

    class Meta:
        model = Question
        fields = ["id", "department", "title", "body", "body_html", "tags"]

    def validate(self, attrs):
        request = self.context["request"]
        if attrs.get("body_html"):
            attrs["body_html"] = sanitize_rich_html(attrs["body_html"])
            if not attrs.get("body"):
                attrs["body"] = strip_html_to_text(attrs["body_html"])

        _validate_post_length(request.user, attrs.get("body", ""))

        images = request.FILES.getlist("images")
        videos = request.FILES.getlist("video")
        ent = get_entitlements(request.user)
        if videos and not ent["can_upload_video"]:
            raise serializers.ValidationError({
                "video": "Only Verified Students and Verified SUG representatives can upload videos."
            })
        if len(videos) > 1:
            raise serializers.ValidationError({"video": "Attach only one video."})
        if images and videos:
            raise serializers.ValidationError({"media": "Attach either images or a video, not both."})
        max_allowed_images = min(mv.MAX_IMAGES, ent["max_post_images"])
        if len(images) > max_allowed_images:
            if max_allowed_images == 1:
                raise serializers.ValidationError({
                    "images": "Non-verified accounts can attach at most 1 image per post. Get verified to upload multiple images and videos."
                })
            raise serializers.ValidationError({"images": f"You can attach at most {max_allowed_images} images."})
        validated = []
        try:
            for f in images:
                w, h = mv.validate_image(f)
                validated.append((QuestionMedia.IMAGE, f, w, h, None))
            for f in videos:
                d = mv.validate_video(f)
                validated.append((QuestionMedia.VIDEO, f, None, None, d))
        except DjangoValidationError as e:
            field = "video" if videos else "images"
            raise serializers.ValidationError({field: e.messages[0]})
        self._media = validated

        # Optional poll options (JSON array or repeated form keys)
        raw_poll = request.data.getlist("poll_options") if hasattr(request.data, "getlist") else request.data.get("poll_options")
        poll_items = []
        if isinstance(raw_poll, list):
            for entry in raw_poll:
                s = str(entry or "").strip()[:140]
                if s:
                    poll_items.append(s)
        if poll_items:
            if len(poll_items) < 2:
                raise serializers.ValidationError({"poll_options": "A poll requires at least 2 options."})
            if len(poll_items) > 6:
                raise serializers.ValidationError({"poll_options": "A poll can have at most 6 options."})
        self._poll_items = poll_items
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        question = Question.objects.create(author=self.context["request"].user, **validated_data)
        question.tags.set(tags)
        for pos, (kind, f, w, h, d) in enumerate(getattr(self, "_media", [])):
            QuestionMedia.objects.create(
                question=question, kind=kind, file=f, width=w, height=h,
                duration=d, size_bytes=f.size, position=pos,
            )
        for pos, text in enumerate(getattr(self, "_poll_items", [])):
            PollOption.objects.create(question=question, text=text, position=pos)
        return question


class QuestionUpdateSerializer(serializers.ModelSerializer):
    """Used by verified students (and moderators) to edit their own posts."""

    tags = TagField(many=True, slug_field="name", queryset=Tag.objects.all(), required=False)

    class Meta:
        model = Question
        fields = ["title", "body", "body_html", "department", "tags"]

    def validate(self, attrs):
        request = self.context["request"]
        if "body_html" in attrs and attrs["body_html"]:
            attrs["body_html"] = sanitize_rich_html(attrs["body_html"])
            if "body" not in attrs:
                attrs["body"] = strip_html_to_text(attrs["body_html"])
        body_check = attrs.get("body", getattr(self.instance, "body", ""))
        _validate_post_length(request.user, body_check)
        return attrs
