import math
import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Case, Count, F, FloatField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.entitlements import VERIFIED_COMMENT_BOOST
from accounts.models import Follow
from config.security import (
    hash_ip, is_probable_bot, sanitize_rich_html, strip_html_to_text,
    validate_and_reencode_image,
)
from notifications.models import Notification
from notifications.services import notify

from accounts.serializers import UserPublicSerializer
from .models import (
    Answer, AnswerLike, AnswerReaction, AnswerVote, ContentReport, HiddenQuestion,
    Mention, PollOption, PollVote, PostView, Question, QuestionBookmark,
    QuestionEditHistory, QuestionLike, QuestionVote,
)
from .permissions import can_delete_question, can_edit_question, is_moderator
from .serializers import (
    AnswerSerializer, QuestionCreateSerializer, QuestionDetailSerializer,
    QuestionListSerializer, QuestionUpdateSerializer,
)

User = get_user_model()

_MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z0-9_.-]{2,30})\b")
_STOPWORDS = {
    "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
    "is", "are", "was", "were", "the", "for", "and", "with", "from", "that",
    "this", "have", "has", "about", "into", "your", "can", "now", "out",
    "check", "does", "will", "should", "could", "there", "their", "been",
}


def extract_and_record_mentions(text: str, actor, *, question=None, answer=None):
    """Find @username mentions, persist Mention rows, and notify mentioned users."""
    if not text or not actor:
        return []
    handles = list({m.group(1) for m in _MENTION_RE.finditer(text)})
    if not handles:
        return []
    q_filter = Q()
    for h in handles[:10]:
        q_filter |= Q(username__iexact=h)
    users = list(User.objects.filter(is_active=True).filter(q_filter))
    link = f"/q/{question.public_id or question.pk}" if question else (f"/q/{answer.question.public_id or answer.question_id}" if answer else "/feed")
    for target in users:
        if target.pk == actor.pk:
            continue
        Mention.objects.create(
            mentioned_user=target, actor=actor, question=question, answer=answer
        )
        where = "a comment" if answer else "a post"
        notify(
            target,
            notif_type=Notification.Type.MENTION,
            text=f"{actor.display_name} (@{actor.username}) mentioned you in {where}.",
            actor=actor,
            link=link,
            question=question or (answer.question if answer else None),
            answer=answer,
        )
    return users


def _record_genuine_view(request, question: Question) -> bool:
    """Strictly unique view tracking (lifetime per user/guest per post).

    - Ignores probable bots.
    - Registered users are counted at most ONCE EVER per post (by user_id).
    - Guests are counted at most ONCE EVER per post (by salted IP + User-Agent fingerprint).
    """
    import hashlib
    from django.conf import settings as _settings
    from django.db import transaction

    if is_probable_bot(request):
        return False

    ip_h = hash_ip(request)
    ua = (request.META.get("HTTP_USER_AGENT") or "")[:160].lower()
    salt = getattr(_settings, "SECRET_KEY", "cenet")[:16]
    guest_key = hashlib.sha256(f"{salt}:{ip_h}:{ua}".encode("utf-8")).hexdigest()[:48]

    user = request.user if (request.user and request.user.is_authenticated) else None
    with transaction.atomic():
        if user is not None:
            if PostView.objects.filter(question=question, user=user).exists():
                return False
            PostView.objects.create(question=question, user=user, ip_hash=guest_key)
        else:
            if PostView.objects.filter(question=question, user__isnull=True, ip_hash=guest_key).exists():
                return False
            PostView.objects.create(question=question, user=None, ip_hash=guest_key)
        Question.objects.filter(pk=question.pk).update(views=F("views") + 1)
    return True


def _extract_topic_keywords(phrase: str):
    tokens = re.findall(r"[A-Za-z0-9]{3,}", (phrase or "").lower())
    return [tok for tok in tokens if tok not in _STOPWORDS][:6]


class IsAuthorOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if is_moderator(request.user):
            return True
        author = getattr(obj, "author", None)
        return author == request.user


class QuestionViewSet(viewsets.ModelViewSet):
    """
    /api/questions/                  GET list (Trending|Newest|Unanswered|Discovery), POST create
    /api/questions/trending-topics/  GET topic-based trending discovery items
    /api/questions/{id}/             GET retrieve (genuine view tracking), PATCH (verified student/mod), DELETE
    /api/questions/{id}/vote/        POST {"direction":"up"|"down"}
    /api/questions/{id}/like/        POST toggle like
    /api/questions/{id}/bookmark/    POST toggle save
    /api/questions/{id}/answer/      POST add comment/reply (multipart or JSON)
    /api/questions/{id}/comments/    GET sorted/paginated top-level comments with nested replies
    /api/questions/{id}/report/      POST report inappropriate post
    """

    queryset = Question.objects.select_related("author", "author__department", "department").prefetch_related("tags", "media", "poll_options")
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["department__name", "tags__name"]
    search_fields = [
        "title", "body", "tags__name", "department__name",
        "author__username", "author__first_name", "author__last_name",
        "answers__body",
    ]

    def get_permissions(self):
        if self.action in ("update", "partial_update"):
            return [permissions.IsAuthenticated()]
        if self.action == "destroy":
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticatedOrReadOnly()]

    def get_object(self):
        """Resolve post by unguessable public_id (e.g. wT9jsmhs) OR legacy numeric pk."""
        from django.http import Http404
        lookup = str(self.kwargs.get(self.lookup_field, "")).strip()
        qs = self.filter_queryset(self.get_queryset())
        obj = qs.filter(public_id=lookup).first()
        if obj is None and lookup.isdigit():
            obj = qs.filter(pk=int(lookup)).first()
        if obj is None:
            raise Http404("Post not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    def get_serializer_class(self):
        if self.action == "create":
            return QuestionCreateSerializer
        if self.action in ("update", "partial_update"):
            return QuestionUpdateSerializer
        if self.action == "retrieve":
            return QuestionDetailSerializer
        return QuestionListSerializer

    def _engagement_score(self, item, now, user_dept_id, followed_ids):
        """Twitter/X-style multi-engagement + velocity gravity + personalization score
        working uniformly for both Question and CommunityPost objects."""
        age_hours = max(0.25, (now - item.created_at).total_seconds() / 3600.0)
        likes = getattr(item, "n_likes", 0) or 0
        ans = getattr(item, "n_ans", 0) or 0
        upvotes = getattr(item, "n_up", 0) or 0
        downvotes = getattr(item, "n_down", 0) or 0
        poll_votes = getattr(item, "n_poll_votes", 0) or 0
        bookmarks = getattr(item, "n_bookmarks", 0) or 0
        views = getattr(item, "views", 0) or 0

        # Multi-signal engagement weighting (comments & bookmarks & likes > votes > poll votes > views)
        engagement = (
            (likes * 3.5)
            + (ans * 5.0)
            + (upvotes * 2.5)
            - (downvotes * 1.2)
            + (poll_votes * 2.0)
            + (bookmarks * 4.0)
            + (math.log1p(views) * 1.4)
        )
        # Velocity gravity decay so active recent posts dominate the feed
        freshness = 1.0 / ((age_hours + 2.0) ** 1.25)
        base = (max(0.0, engagement) + 1.5) * freshness

        mult = 1.0
        dept_id = getattr(item, "department_id", None)
        if user_dept_id and dept_id == user_dept_id:
            mult += 0.25
        if getattr(item, "author_id", None) in followed_ids:
            mult += 0.40
        author = getattr(item, "author", None)
        if author and (getattr(author, "is_verified_student", False) or getattr(author, "is_verified_staff", False)):
            mult += 0.10
        if getattr(item, "promoted", False) or getattr(item, "is_important", False):
            mult += 0.55
        return base * mult

    def _serialize_community_post_as_feed_item(self, cp, request):
        """Adapt a public CommunityPost into the standard Feed item schema with clickable community metadata."""
        from .serializers import human_time
        user = request.user if request.user.is_authenticated else None
        liked = bool(user and cp.likes_set.filter(user=user).exists())
        media = []
        if cp.image:
            try:
                url = request.build_absolute_uri(cp.image.url)
            except Exception:
                url = cp.image.url
            media.append({
                "id": cp.id,
                "kind": "image",
                "url": url,
                "width": None,
                "height": None,
                "duration": None,
            })
        comm_avatar = ""
        if cp.community.avatar:
            try:
                comm_avatar = request.build_absolute_uri(cp.community.avatar.url)
            except Exception:
                comm_avatar = cp.community.avatar.url
        n_ans = getattr(cp, "n_ans", None)
        if n_ans is None:
            n_ans = cp.comments.count()
        n_likes = getattr(cp, "n_likes", None)
        if n_likes is None:
            n_likes = cp.likes_set.count()
        return {
            "id": cp.id,
            "feed_key": f"cp-{cp.id}",
            "public_id": f"cp-{cp.id}",
            "author": UserPublicSerializer(cp.author, context={"request": request}).data,
            "dept": cp.community.name,
            "department": None,
            "title": cp.title or "",
            "body": cp.body or "",
            "body_html": cp.body_html or "",
            "tags": [cp.community.category] if cp.community.category else [],
            "media": media,
            "votes": 0,
            "likes": n_likes,
            "ans": n_ans,
            "views": 0,
            "answered": n_ans > 0,
            "promoted": bool(cp.is_important),
            "time": human_time(cp.created_at),
            "voted": None,
            "liked": liked,
            "saved": False,
            "can_delete": False,
            "can_edit": False,
            "delete_deadline": None,
            "poll_options": [],
            "poll_total_votes": 0,
            "my_poll_option": None,
            "created_at": cp.created_at.isoformat(),
            "edited_at": cp.edited_at.isoformat() if cp.edited_at else None,
            "is_community_post": True,
            "community_post_id": cp.id,
            "community_id": cp.community_id,
            "community_slug": cp.community.slug,
            "community_name": cp.community.name,
            "community_accent_color": cp.community.accent_color or "#2563EB",
            "community_avatar_url": comm_avatar,
        }

    def _rank_trending(self, items):
        now = timezone.now()
        user = self.request.user if self.request.user.is_authenticated else None
        followed_ids = set()
        user_dept_id = None
        if user:
            user_dept_id = user.department_id
            followed_ids = set(Follow.objects.filter(follower=user).values_list("following_id", flat=True))

        pool = list(items[:240]) if not isinstance(items, list) else list(items)
        pool.sort(key=lambda item: self._engagement_score(item, now, user_dept_id, followed_ids), reverse=True)
        return pool

    def get_queryset(self):
        qs = super().get_queryset().annotate(
            n_likes=Count("likes_set", distinct=True),
            n_up=Count("votes_set", filter=Q(votes_set__direction="up"), distinct=True),
            n_down=Count("votes_set", filter=Q(votes_set__direction="down"), distinct=True),
            n_ans=Count("answers", distinct=True),
            n_poll_votes=Count("poll_votes", distinct=True),
            n_bookmarks=Count("bookmarks", distinct=True),
        )
        if self.action == "list" and self.request.user.is_authenticated:
            hidden_ids = HiddenQuestion.objects.filter(user=self.request.user).values_list("question_id", flat=True)
            qs = qs.exclude(pk__in=hidden_ids)
        p = self.request.query_params
        topic = (p.get("topic") or "").strip()
        if topic and topic.lower() not in ("all", "all faculties"):
            # Strict faculty filter: ONLY show posts belonging to this specific faculty
            # (never leak general/all-faculty posts when a user selects a specific faculty).
            from departments.models import Department
            if Department.objects.filter(name__iexact=topic).exists():
                qs = qs.filter(department__name__iexact=topic).distinct()
            else:
                qs = qs.filter(
                    Q(department__name__iexact=topic) | Q(tags__name__iexact=topic)
                ).distinct()

        # Topic/keyword-based discovery filter (e.g. clicking a Trending Now keyword)
        discovery = (p.get("discovery") or "").strip()
        if discovery:
            keywords = _extract_topic_keywords(discovery) or [discovery.lstrip("#").lower()]
            if keywords:
                q_obj = Q()
                for kw in keywords:
                    q_obj |= (
                        Q(title__icontains=kw)
                        | Q(body__icontains=kw)
                        | Q(tags__name__icontains=kw)
                        | Q(department__name__icontains=kw)
                        | Q(answers__body__icontains=kw)
                    )
                matched = qs.filter(q_obj).distinct()
                if matched.exists():
                    qs = matched
                else:
                    qs = qs.order_by("-n_likes", "-n_ans", "-created_at")

        if p.get("mine") == "1" and self.request.user.is_authenticated:
            qs = qs.filter(author=self.request.user)

        if p.get("saved") == "1" and self.request.user.is_authenticated:
            qs = qs.filter(bookmarks__user=self.request.user).distinct()

        ordering = p.get("ordering", "trending")
        if ordering == "newest":
            qs = qs.order_by("-created_at")
        elif ordering == "unanswered":
            qs = qs.filter(n_ans=0).order_by("-created_at")
        else:
            qs = qs.order_by("-n_likes", "-n_ans", "-created_at")
        return qs

    def list(self, request, *args, **kwargs):
        p = request.query_params
        ordering = (p.get("ordering") or "trending").strip().lower()
        topic = (p.get("topic") or "").strip()
        discovery = (p.get("discovery") or "").strip()
        search_q = (p.get("search") or "").strip()
        is_all_faculties = (not topic) or (topic.lower() in ("all", "all faculties"))
        include_community_posts = (
            is_all_faculties
            and not p.get("mine")
            and not p.get("saved")
            and not search_q
        )

        qs = self.filter_queryset(self.get_queryset())

        if include_community_posts:
            from communities.models import Community, CommunityPost
            cp_qs = (
                CommunityPost.objects.filter(community__visibility=Community.Visibility.PUBLIC)
                .select_related("community", "author", "author__department")
                .annotate(
                    n_likes=Count("likes_set", distinct=True),
                    n_ans=Count("comments", distinct=True),
                )
            )
            if discovery:
                kws = _extract_topic_keywords(discovery) or [discovery.lstrip("#").lower()]
                cq = Q()
                for kw in kws:
                    cq |= (
                        Q(title__icontains=kw)
                        | Q(body__icontains=kw)
                        | Q(community__name__icontains=kw)
                        | Q(comments__body__icontains=kw)
                    )
                cp_qs = cp_qs.filter(cq).distinct()
            if ordering == "unanswered":
                cp_qs = cp_qs.filter(n_ans=0)

            combined = list(qs[:180]) + list(cp_qs.order_by("-created_at")[:60])
            if ordering == "newest" or ordering == "unanswered":
                combined.sort(key=lambda x: x.created_at, reverse=True)
            else:
                combined = self._rank_trending(combined)

            page = self.paginate_queryset(combined)
            items_to_serialize = page if page is not None else combined
            out = []
            for item in items_to_serialize:
                if isinstance(item, Question):
                    out.append(self.get_serializer(item).data)
                else:
                    out.append(self._serialize_community_post_as_feed_item(item, request))
            if page is not None:
                return self.get_paginated_response(out)
            return Response(out)

        if ordering == "trending" and not p.get("mine") and not p.get("saved"):
            ranked = self._rank_trending(qs)
            page = self.paginate_queryset(ranked)
            if page is not None:
                ser = self.get_serializer(page, many=True)
                return self.get_paginated_response(ser.data)
            return Response(self.get_serializer(ranked, many=True).data)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="trending-topics")
    def trending_topics(self, request):
        """Keyword-engagement-driven Trending Now rankings across regular posts & public community posts.

        Aggregates total engagements (likes, comments, votes, poll votes, bookmarks, views)
        across all posts sharing each keyword/hashtag so rankings reflect real campus buzz.
        """
        from collections import defaultdict
        from communities.models import Community, CommunityPost

        qs = list(self.get_queryset()[:180])
        cps = list(
            CommunityPost.objects.filter(community__visibility=Community.Visibility.PUBLIC)
            .select_related("community", "author")
            .annotate(
                n_likes=Count("likes_set", distinct=True),
                n_ans=Count("comments", distinct=True),
            )
            .order_by("-created_at")[:80]
        )

        kw_stats = defaultdict(lambda: {
            "score": 0.0,
            "engagements": 0,
            "likes": 0,
            "answers": 0,
            "post_count": 0,
            "sample_id": None,
            "sample_dept": "Campus",
            "display": "",
            "is_tag": False,
        })

        def add_item(item, *, is_comm=False):
            likes = getattr(item, "n_likes", 0) or 0
            ans = getattr(item, "n_ans", 0) or 0
            up = getattr(item, "n_up", 0) or 0
            poll_v = getattr(item, "n_poll_votes", 0) or 0
            bms = getattr(item, "n_bookmarks", 0) or 0
            views = getattr(item, "views", 0) or 0

            raw_eng = likes + ans + up + poll_v + bms
            weighted = (likes * 3.5) + (ans * 5.0) + (up * 2.5) + (poll_v * 2.0) + (bms * 4.0) + (math.log1p(views) * 1.2) + 1.0

            seen_keys = set()
            tag_list = [] if is_comm else list(item.tags.values_list("name", flat=True))
            for t in tag_list:
                clean = t.strip().lstrip("#")
                key = clean.lower()
                if len(key) >= 2 and key not in seen_keys:
                    seen_keys.add(key)
                    st = kw_stats[key]
                    st["score"] += weighted * 1.35
                    st["engagements"] += raw_eng
                    st["likes"] += likes
                    st["answers"] += ans
                    st["post_count"] += 1
                    st["is_tag"] = True
                    st["display"] = f"#{clean}"
                    if st["sample_id"] is None:
                        st["sample_id"] = item.id
                        st["sample_dept"] = item.community.name if is_comm else (item.department.name if item.department else "General")

            # Extract hashtags inline & meaningful keywords from title/body
            text = f"{item.title or ''} {item.body or ''}"
            for ht in re.findall(r"#([A-Za-z0-9_]{2,30})", text):
                key = ht.lower()
                if key not in seen_keys:
                    seen_keys.add(key)
                    st = kw_stats[key]
                    st["score"] += weighted * 1.3
                    st["engagements"] += raw_eng
                    st["likes"] += likes
                    st["answers"] += ans
                    st["post_count"] += 1
                    st["is_tag"] = True
                    st["display"] = f"#{ht}"
                    if st["sample_id"] is None:
                        st["sample_id"] = item.id
                        st["sample_dept"] = item.community.name if is_comm else (item.department.name if item.department else "General")

            for kw in _extract_topic_keywords(text):
                if kw not in seen_keys and len(kw) >= 4:
                    seen_keys.add(kw)
                    st = kw_stats[kw]
                    st["score"] += weighted
                    st["engagements"] += raw_eng
                    st["likes"] += likes
                    st["answers"] += ans
                    st["post_count"] += 1
                    if not st["display"]:
                        st["display"] = kw.title()
                    if st["sample_id"] is None:
                        st["sample_id"] = item.id
                        st["sample_dept"] = item.community.name if is_comm else (item.department.name if item.department else "General")

        for q in qs:
            add_item(q, is_comm=False)
        for cp in cps:
            add_item(cp, is_comm=True)

        # Prefer keywords appearing across multiple posts or high total engagement
        ranked_kws = sorted(
            kw_stats.items(),
            key=lambda kv: (kv[1]["score"] * (1.0 + 0.3 * min(kv[1]["post_count"] - 1, 5)), kv[1]["engagements"]),
            reverse=True,
        )[:5]

        out = []
        for idx, (key, st) in enumerate(ranked_kws, start=1):
            out.append({
                "n": idx,
                "id": st["sample_id"] or idx,
                "title": st["display"],
                "keyword": key,
                "dept": st["sample_dept"],
                "post_count": st["post_count"],
                "engagements": st["engagements"],
                "answers": st["answers"],
                "likes": st["likes"],
                "discovery": key,
            })
        return Response(out)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if _record_genuine_view(request, instance):
            instance.refresh_from_db(fields=["views"])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.save()

        # Notify followers of this author
        follower_ids = Follow.objects.filter(following=request.user).values_list("follower_id", flat=True)[:200]
        if follower_ids:
            for follower in User.objects.filter(pk__in=follower_ids, is_active=True):
                notify(
                    follower,
                    notif_type=Notification.Type.POST_FROM_FOLLOWED,
                    text=f"{request.user.display_name} (@{request.user.username}) posted: {question.title[:70]}",
                    actor=request.user,
                    link=f"/q/{question.public_id or question.pk}",
                    question=question,
                )

        # Record & notify @mentions
        extract_and_record_mentions(f"{question.title} {question.body}", request.user, question=question)

        out = QuestionDetailSerializer(question, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        question = self.get_object()
        if not can_edit_question(request.user, question):
            if question.author_id == request.user.id:
                return Response(
                    {"detail": "Only verified students and verified SUG officials can edit published posts."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response({"detail": "You cannot edit someone else's post."}, status=status.HTTP_403_FORBIDDEN)

        old_title, old_body = question.title, question.body
        ser = self.get_serializer(question, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        updated = ser.save(edited_at=timezone.now())
        if updated.title != old_title or updated.body != old_body:
            QuestionEditHistory.objects.create(
                question=updated,
                editor=request.user,
                previous_title=old_title,
                previous_body=old_body,
            )
        return Response(QuestionDetailSerializer(updated, context={"request": request}).data)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Ordinary owners: 24 h server clock. Verified students: anytime. Admins: always."""
        question = self.get_object()
        if not can_delete_question(request.user, question):
            if question.author_id == request.user.id:
                return Response(
                    {"detail": "Ordinary accounts can only delete posts within 24 hours. Verified students can delete anytime."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response({"detail": "You can't delete someone else's post."}, status=status.HTTP_403_FORBIDDEN)
        question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def vote(self, request, pk=None):
        question = self.get_object()
        direction = request.data.get("direction")
        if direction not in ("up", "down"):
            return Response({"detail": "direction must be 'up' or 'down'."}, status=400)

        existing = QuestionVote.objects.filter(question=question, user=request.user).first()
        if existing and existing.direction == direction:
            existing.delete()
            voted = None
        elif existing:
            existing.direction = direction
            existing.save()
            voted = direction
        else:
            QuestionVote.objects.create(question=question, user=request.user, direction=direction)
            voted = direction
            if direction == "up":
                notify(
                    question.author,
                    notif_type=Notification.Type.LIKE,
                    text=f"{request.user.display_name} upvoted your post: {question.title[:60]}",
                    actor=request.user,
                    link=f"/q/{question.public_id or question.pk}",
                    question=question,
                )
        return Response({"votes": question.votes, "voted": voted})

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        question = self.get_object()
        like, created = QuestionLike.objects.get_or_create(question=question, user=request.user)
        if not created:
            like.delete()
        else:
            notify(
                question.author,
                notif_type=Notification.Type.LIKE,
                text=f"{request.user.display_name} liked your post: {question.title[:60]}",
                actor=request.user,
                link=f"/q/{question.public_id or question.pk}",
                question=question,
            )
        return Response({"likes": question.likes, "liked": created})

    @action(detail=True, methods=["post"])
    def bookmark(self, request, pk=None):
        question = self.get_object()
        bm, created = QuestionBookmark.objects.get_or_create(question=question, user=request.user)
        if not created:
            bm.delete()
        return Response({"saved": created})

    @action(detail=True, methods=["get"])
    def comments(self, request, pk=None):
        """Sorted top-level comments (with nested replies) for a question.

        Supports ?sort=recent|liked|oldest|disliked|recommended
        """
        question = self.get_object()
        sort = (request.query_params.get("sort") or "recent").lower()
        qs = (
            question.answers.filter(parent__isnull=True)
            .select_related("author", "author__department")
            .annotate(
                n_upvotes=Count("votes_set", filter=Q(votes_set__direction=AnswerVote.UP), distinct=True),
                n_downvotes=Count("votes_set", filter=Q(votes_set__direction=AnswerVote.DOWN), distinct=True),
                n_likes=Count("likes_set", distinct=True),
                verified_boost=Case(
                    When(author__is_verified_student=True, then=Value(VERIFIED_COMMENT_BOOST)),
                    default=Value(0.0),
                    output_field=FloatField(),
                ),
            )
        )
        if sort == "liked":
            qs = qs.order_by("-n_upvotes", "-n_likes", "-created_at")
        elif sort == "oldest":
            qs = qs.order_by("created_at")
        elif sort == "disliked":
            qs = qs.order_by("-n_downvotes", "-created_at")
        elif sort == "recommended":
            # Modest verified-student boost combined with real engagement & recency
            qs = qs.annotate(
                rank_score=F("n_upvotes") * 1.0 - F("n_downvotes") * 0.5 + F("verified_boost")
            ).order_by("-rank_score", "-created_at")
        else:  # recent (explicit user choice is never overridden)
            qs = qs.order_by("-created_at")

        page = self.paginate_queryset(qs)
        ctx = {"request": request, "_depth": 0}
        if page is not None:
            return self.get_paginated_response(AnswerSerializer(page, many=True, context=ctx).data)
        return Response(AnswerSerializer(qs, many=True, context=ctx).data)

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        """Add a top-level comment or threaded reply (supports rich text + image attachment + @mentions)."""
        question = self.get_object()
        body_html = sanitize_rich_html(request.data.get("body_html", ""))
        body = (request.data.get("body") or strip_html_to_text(body_html)).strip()
        uploaded_img = request.FILES.get("image")

        if not body and not uploaded_img:
            return Response({"detail": "Comment body or image is required."}, status=400)
        if len(body) > 4000:
            return Response({"detail": "Comment cannot exceed 4,000 characters."}, status=400)

        parent = None
        parent_id = request.data.get("parent")
        if parent_id:
            parent = get_object_or_404(Answer, pk=parent_id, question=question)

        clean_img = None
        if uploaded_img:
            try:
                clean_img = validate_and_reencode_image(uploaded_img, max_bytes=8 * 1024 * 1024, max_dim=1400)
            except DjangoValidationError as e:
                return Response({"detail": e.messages[0]}, status=400)

        ans = Answer.objects.create(
            question=question,
            author=request.user,
            parent=parent,
            body=body,
            body_html=body_html,
            image=clean_img,
        )

        # Notifications
        if parent and parent.author_id != request.user.pk:
            notify(
                parent.author,
                notif_type=Notification.Type.COMMENT,
                text=f"{request.user.display_name} replied to your comment on: {question.title[:50]}",
                actor=request.user,
                link=f"/q/{question.public_id or question.pk}",
                question=question,
                answer=ans,
            )
        if question.author_id != request.user.pk and (not parent or parent.author_id != question.author_id):
            notify(
                question.author,
                notif_type=Notification.Type.ANSWER,
                text=f"{request.user.display_name} commented on your post: {question.title[:50]}",
                actor=request.user,
                link=f"/q/{question.public_id or question.pk}",
                question=question,
                answer=ans,
            )

        extract_and_record_mentions(body, request.user, question=question, answer=ans)

        return Response(
            AnswerSerializer(ans, context={"request": request, "_depth": 0}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def takedown(self, request, pk=None):
        """POST /api/questions/<id>/takedown/ — Admin moderation takedown with in-app + email notification."""
        if not is_moderator(request.user):
            return Response({"detail": "Only administrators can take down posts."}, status=403)
        question = self.get_object()
        reason = (request.data.get("reason") or request.data.get("note") or "").strip()
        if len(reason) < 5:
            return Response({"detail": "Please provide a clear reason for taking down this post."}, status=400)
        author = question.author
        snippet = (question.title or question.body or f"Post #{question.pk}")[:80]
        from advertising.models import AuditLog
        AuditLog.objects.create(
            actor=request.user,
            action="post.takedown",
            target_type="question",
            target_id=str(question.pk),
            metadata={"snippet": snippet, "author_id": author.pk, "reason": reason},
            ip_hash=hash_ip(request),
        )
        notify(
            author,
            notif_type=Notification.Type.SYSTEM,
            text=f"Your post “{snippet}” was removed by an administrator. Reason: {reason[:160]}",
            actor=request.user,
            link="/feed",
            dedupe_seconds=0,
        )
        try:
            from accounts.email_utils import send_platform_email
            send_platform_email(
                recipient_email=author.email,
                subject="CampusNetwork (Cenet): Your Post Was Taken Down",
                message=(
                    f"Hello {author.display_name},\n\n"
                    f"Your post (“{snippet}”) was taken down by a CampusNetwork administrator for violating community guidelines.\n\n"
                    f"Reason: {reason}\n\n"
                    f"— CampusNetwork (Cenet)"
                ),
                allow_formsubmit=True,
            )
        except Exception:
            pass
        question.delete()
        return Response({"detail": "Post removed and author notified.", "reason": reason})

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        question = self.get_object()
        reason = (request.data.get("reason") or "").strip()[:255]
        if len(reason) < 5:
            return Response({"detail": "Please provide a brief reason."}, status=400)
        ContentReport.objects.create(reporter=request.user, question=question, reason=reason)
        return Response({"detail": "Report submitted."}, status=201)

    @action(detail=True, methods=["post"])
    def hide(self, request, pk=None):
        """'See less of this' — hides this post from the authenticated user's feed."""
        question = self.get_object()
        HiddenQuestion.objects.get_or_create(user=request.user, question=question)
        return Response({"hidden": True, "detail": "We'll show you less like this."})

    @action(detail=True, methods=["get"])
    def likers(self, request, pk=None):
        """Post analytics & 'Liked By' user list — accessible to post author or moderators."""
        question = self.get_object()
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)
        if question.author_id != request.user.pk and not is_moderator(request.user):
            return Response({"detail": "Only the post author can inspect post analytics."}, status=403)
        like_rows = question.likes_set.select_related("user", "user__department").order_by("-created_at")[:100]
        users = [row.user for row in like_rows]
        return Response({
            "views": question.views or 0,
            "likes": question.likes_set.count(),
            "upvotes": question.votes_set.filter(direction=QuestionVote.UP).count(),
            "downvotes": question.votes_set.filter(direction=QuestionVote.DOWN).count(),
            "comments": question.answers.count(),
            "bookmarks": question.bookmarks.count(),
            "likers": UserPublicSerializer(users, many=True, context={"request": request}).data,
        })

    @action(detail=True, methods=["post"], url_path="vote-poll")
    def vote_poll(self, request, pk=None):
        """Cast or change a vote on a poll option attached to this question."""
        question = self.get_object()
        option_id = request.data.get("option_id")
        option = get_object_or_404(PollOption, pk=option_id, question=question)
        PollVote.objects.update_or_create(
            question=question,
            user=request.user,
            defaults={"option": option},
        )
        ser = QuestionListSerializer(question, context={"request": request}).data
        return Response({
            "poll_options": ser["poll_options"],
            "poll_total_votes": ser["poll_total_votes"],
            "my_poll_option": ser["my_poll_option"],
        })


class AnswerViewSet(viewsets.ModelViewSet):
    """
    /api/answers/{id}/           PATCH/DELETE (author or moderator)
    /api/answers/{id}/vote/      POST {"direction":"up"|"down"} toggle/switch vote
    /api/answers/{id}/like/      POST toggle like (kept for backward compatibility)
    /api/answers/{id}/react/     POST {"kind":"fire"|"bulb"|"clap"} (kept for backward compatibility)
    /api/answers/{id}/report/    POST {"reason":"..."}
    """

    queryset = Answer.objects.select_related("author", "author__department", "question")
    serializer_class = AnswerSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsAuthorOrReadOnly()]
        return [permissions.IsAuthenticatedOrReadOnly()]

    @action(detail=True, methods=["post"])
    def vote(self, request, pk=None):
        answer = self.get_object()
        direction = request.data.get("direction")
        if direction not in (AnswerVote.UP, AnswerVote.DOWN):
            return Response({"detail": "direction must be 'up' or 'down'."}, status=400)

        existing = AnswerVote.objects.filter(answer=answer, user=request.user).first()
        if existing and existing.direction == direction:
            existing.delete()
            my_vote = None
        elif existing:
            existing.direction = direction
            existing.save(update_fields=["direction"])
            my_vote = direction
        else:
            AnswerVote.objects.create(answer=answer, user=request.user, direction=direction)
            my_vote = direction
            if direction == AnswerVote.UP:
                notify(
                    answer.author,
                    notif_type=Notification.Type.LIKE,
                    text=f"{request.user.display_name} upvoted your comment.",
                    actor=request.user,
                    link=f"/q/{answer.question.public_id or answer.question_id}",
                    question=answer.question,
                    answer=answer,
                )

        return Response({
            "upvotes": answer.upvotes_count,
            "downvotes": answer.downvotes_count,
            "my_vote": my_vote,
        })

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        answer = self.get_object()
        like, created = AnswerLike.objects.get_or_create(answer=answer, user=request.user)
        if not created:
            like.delete()
        else:
            notify(
                answer.author,
                notif_type=Notification.Type.LIKE,
                text=f"{request.user.display_name} liked your comment.",
                actor=request.user,
                link=f"/q/{answer.question.public_id or answer.question_id}",
                question=answer.question,
                answer=answer,
            )
        return Response({"likes": answer.likes, "liked": created})

    @action(detail=True, methods=["post"])
    def react(self, request, pk=None):
        answer = self.get_object()
        kind = request.data.get("kind")
        if kind not in dict(AnswerReaction.KINDS):
            return Response({"detail": "invalid reaction kind."}, status=400)
        rxn, created = AnswerReaction.objects.get_or_create(answer=answer, user=request.user, kind=kind)
        if not created:
            rxn.delete()
        return Response({"reactions": answer.reaction_counts()})

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        answer = self.get_object()
        reason = (request.data.get("reason") or "").strip()[:255]
        if len(reason) < 5:
            return Response({"detail": "Please provide a brief reason."}, status=400)
        ContentReport.objects.create(reporter=request.user, answer=answer, reason=reason)
        return Response({"detail": "Comment reported for review."}, status=201)


from rest_framework.views import APIView


class UniversalSearchView(APIView):
    """GET /api/search/?q=<keyword> — Deep keyword search across everything users have done:
    People, Posts, Post Comments, Communities, Community Posts, and Community Comments."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({
                "query": q,
                "people": [],
                "posts": [],
                "comments": [],
                "communities": [],
                "community_posts": [],
            })

        from communities.models import Community, CommunityPost, CommunityPostComment
        from communities.serializers import CommunitySerializer, CommunityPostSerializer

        # 1. People
        people_qs = User.objects.filter(is_active=True).filter(
            Q(username__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(bio__icontains=q)
            | Q(department__name__icontains=q)
            | Q(title__icontains=q)
            | Q(level__icontains=q)
        ).select_related("department")[:15]
        people = UserPublicSerializer(people_qs, many=True, context={"request": request}).data

        # 2. Posts (matching title, body, tags, faculty, author, OR comments on that post)
        posts_qs = (
            Question.objects.select_related("author", "author__department", "department")
            .prefetch_related("tags", "media", "poll_options")
            .filter(
                Q(title__icontains=q)
                | Q(body__icontains=q)
                | Q(tags__name__icontains=q)
                | Q(department__name__icontains=q)
                | Q(author__username__icontains=q)
                | Q(author__first_name__icontains=q)
                | Q(author__last_name__icontains=q)
                | Q(answers__body__icontains=q)
            )
            .distinct()
            .order_by("-created_at")[:20]
        )
        posts = QuestionListSerializer(posts_qs, many=True, context={"request": request}).data

        # 3. Direct post comments matching keyword
        ans_qs = (
            Answer.objects.select_related("author", "author__department", "question")
            .filter(Q(body__icontains=q) | Q(author__username__icontains=q))
            .order_by("-created_at")[:15]
        )
        comments = [
            {
                "id": a.id,
                "body": a.body[:240],
                "author": UserPublicSerializer(a.author, context={"request": request}).data,
                "question_id": a.question_id,
                "question_public_id": a.question.public_id or str(a.question_id),
                "question_title": (a.question.title or a.question.body[:80]),
                "created_at": a.created_at.isoformat(),
            }
            for a in ans_qs
        ]

        # 4. Communities
        comm_qs = Community.objects.filter(visibility=Community.Visibility.PUBLIC).filter(
            Q(name__icontains=q)
            | Q(description__icontains=q)
            | Q(category__icontains=q)
            | Q(slug__icontains=q)
        )[:12]
        communities = CommunitySerializer(comm_qs, many=True, context={"request": request}).data

        # 5. Community posts (matching title, body, community name, author, OR community post comments!)
        cp_qs = (
            CommunityPost.objects.filter(community__visibility=Community.Visibility.PUBLIC)
            .select_related("community", "author", "author__department")
            .filter(
                Q(title__icontains=q)
                | Q(body__icontains=q)
                | Q(community__name__icontains=q)
                | Q(author__username__icontains=q)
                | Q(comments__body__icontains=q)
            )
            .distinct()
            .order_by("-created_at")[:15]
        )
        community_posts = CommunityPostSerializer(cp_qs, many=True, context={"request": request}).data
        for idx, cp_obj in enumerate(cp_qs):
            community_posts[idx]["community_slug"] = cp_obj.community.slug
            community_posts[idx]["community_name"] = cp_obj.community.name

        # 6. Community comments
        cc_qs = (
            CommunityPostComment.objects.filter(post__community__visibility=Community.Visibility.PUBLIC)
            .select_related("author", "post", "post__community")
            .filter(Q(body__icontains=q))
            .order_by("-created_at")[:10]
        )
        community_comments = [
            {
                "id": cc.id,
                "body": cc.body[:240],
                "author": UserPublicSerializer(cc.author, context={"request": request}).data,
                "community_slug": cc.post.community.slug,
                "community_name": cc.post.community.name,
                "post_id": cc.post_id,
                "post_title": (cc.post.title or cc.post.body[:80]),
                "created_at": cc.created_at.isoformat(),
            }
            for cc in cc_qs
        ]

        return Response({
            "query": q,
            "people": people,
            "posts": posts,
            "comments": comments,
            "communities": communities,
            "community_posts": community_posts,
            "community_comments": community_comments,
        })
