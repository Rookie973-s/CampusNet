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
    """Deduplicated genuine view tracking: ignores probable bots and counts at most
    1 view per user (or per hashed IP for guests) per question per hour."""
    if is_probable_bot(request):
        return False
    ip_h = hash_ip(request)
    user = request.user if (request.user and request.user.is_authenticated) else None
    since = timezone.now() - timedelta(hours=1)
    recent = PostView.objects.filter(question=question, viewed_at__gte=since)
    recent = recent.filter(user=user) if user else recent.filter(ip_hash=ip_h)
    if recent.exists():
        return False
    PostView.objects.create(question=question, user=user, ip_hash=ip_h)
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
    search_fields = ["title", "body", "tags__name", "department__name", "author__username"]

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

    def _rank_trending(self, qs):
        """Weighted trending ranking balancing engagement, recency decay,
        user's department relevance, and followed accounts."""
        now = timezone.now()
        user = self.request.user if self.request.user.is_authenticated else None
        followed_ids = set()
        user_dept_id = None
        if user:
            user_dept_id = user.department_id
            followed_ids = set(Follow.objects.filter(follower=user).values_list("following_id", flat=True))

        # Limit scoring set to a reasonable recent/active pool for fast sorting
        items = list(qs[:200])

        def score(q):
            age_hours = max(0.25, (now - q.created_at).total_seconds() / 3600.0)
            likes = getattr(q, "n_likes", 0) or 0
            upvotes = getattr(q, "n_up", 0) or 0
            downvotes = getattr(q, "n_down", 0) or 0
            ans = getattr(q, "n_ans", 0) or 0
            views = q.views or 0

            # Weighted engagement (not equal weights: answers & likes > net votes > views)
            engagement = (likes * 3.0) + (ans * 4.5) + (max(0, upvotes - downvotes) * 2.0) + (math.log1p(views) * 1.2)
            # Gravity decay so fresh active posts rise above stale ones
            freshness = 1.0 / ((age_hours + 3.0) ** 1.15)
            base = (engagement + 1.5) * freshness

            # Personalization multiplier (gentle boost, never overwhelms quality)
            mult = 1.0
            if user_dept_id and q.department_id == user_dept_id:
                mult += 0.25
            if q.author_id in followed_ids:
                mult += 0.35
            if q.promoted:
                mult += 0.50
            return base * mult

        items.sort(key=score, reverse=True)
        return items

    def get_queryset(self):
        qs = super().get_queryset().annotate(
            n_likes=Count("likes_set", distinct=True),
            n_up=Count("votes_set", filter=Q(votes_set__direction="up"), distinct=True),
            n_down=Count("votes_set", filter=Q(votes_set__direction="down"), distinct=True),
            n_ans=Count("answers", distinct=True),
        )
        if self.action == "list" and self.request.user.is_authenticated:
            hidden_ids = HiddenQuestion.objects.filter(user=self.request.user).values_list("question_id", flat=True)
            qs = qs.exclude(pk__in=hidden_ids)
        p = self.request.query_params
        topic = p.get("topic")
        if topic and topic != "All":
            qs = qs.filter(
                Q(department__name__iexact=topic)
                | Q(department__isnull=True)
                | Q(tags__name__iexact=topic)
            ).distinct()

        # Topic-based discovery filter (e.g. clicking a Trending Now entry)
        discovery = (p.get("discovery") or "").strip()
        if discovery:
            keywords = _extract_topic_keywords(discovery)
            if keywords:
                q_obj = Q()
                for kw in keywords:
                    q_obj |= (
                        Q(title__icontains=kw)
                        | Q(body__icontains=kw)
                        | Q(tags__name__icontains=kw)
                        | Q(department__name__icontains=kw)
                    )
                matched = qs.filter(q_obj).distinct()
                # Reasonable fallback when direct keyword matches are scarce
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
        ordering = request.query_params.get("ordering", "trending")
        qs = self.filter_queryset(self.get_queryset())
        if ordering == "trending" and not request.query_params.get("mine") and not request.query_params.get("saved"):
            ranked = self._rank_trending(qs)
            page = self.paginate_queryset(ranked)
            if page is not None:
                ser = self.get_serializer(page, many=True)
                return self.get_paginated_response(ser.data)
            return Response(self.get_serializer(ranked, many=True).data)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="trending-topics")
    def trending_topics(self, request):
        """Return dynamic Trending Now discovery topics derived from real active discussions."""
        qs = self.get_queryset()
        ranked = self._rank_trending(qs)[:5]
        out = []
        for idx, q in enumerate(ranked, start=1):
            kws = _extract_topic_keywords(q.title)
            tag_names = list(q.tags.values_list("name", flat=True)[:2])
            discovery_query = tag_names[0] if tag_names else (" ".join(kws[:2]) or q.title[:40])
            out.append({
                "n": idx,
                "id": q.id,
                "title": q.title,
                "dept": q.department.name if q.department else "General",
                "answers": getattr(q, "n_ans", 0),
                "likes": getattr(q, "n_likes", 0),
                "discovery": discovery_query,
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
                    link=f"/q/{question.pk}",
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
                    link=f"/q/{question.pk}",
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
                link=f"/q/{question.pk}",
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
                link=f"/q/{question.pk}",
                question=question,
                answer=ans,
            )
        if question.author_id != request.user.pk and (not parent or parent.author_id != question.author_id):
            notify(
                question.author,
                notif_type=Notification.Type.ANSWER,
                text=f"{request.user.display_name} commented on your post: {question.title[:50]}",
                actor=request.user,
                link=f"/q/{question.pk}",
                question=question,
                answer=ans,
            )

        extract_and_record_mentions(body, request.user, question=question, answer=ans)

        return Response(
            AnswerSerializer(ans, context={"request": request, "_depth": 0}).data,
            status=status.HTTP_201_CREATED,
        )

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
                    link=f"/q/{answer.question_id}",
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
                link=f"/q/{answer.question_id}",
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
