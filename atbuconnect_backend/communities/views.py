from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from config.security import sanitize_rich_html, strip_html_to_text
from notifications.models import Notification
from notifications.services import notify

from .models import (
    Community, CommunityMembership, CommunityPost, CommunityPostComment,
    CommunityPostLike, CommunityPostReport,
)
from .serializers import (
    CommunityMemberSerializer, CommunityPostCommentSerializer,
    CommunityPostSerializer, CommunitySerializer,
)
from .services import ensure_official_community

User = get_user_model()


def _is_platform_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, "role", None) == "admin"))


def _get_membership(community, user):
    if not (user and user.is_authenticated):
        return None
    return CommunityMembership.objects.filter(community=community, user=user).first()


class CommunityViewSet(viewsets.ModelViewSet):
    """
    /api/communities/                              GET discovery list (?category=&q=&mine=&sort=), POST create
    /api/communities/{slug}/                       GET details, PATCH update (owner/admin), DELETE (owner/admin)
    /api/communities/{slug}/follow/                POST follow, DELETE unfollow
    /api/communities/{slug}/notifications/         PATCH {notif_level: "all"|"important"|"none"}
    /api/communities/{slug}/members/               GET followers list
    /api/communities/{slug}/roles/                 POST {user_id, role} — owner appoints/removes moderator
    /api/communities/{slug}/posts/                 GET posts, POST publish (owner/admin/moderator only)
    """

    serializer_class = CommunitySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    lookup_field = "slug"

    def get_queryset(self):
        # Guarantee official CampusNetwork community exists
        ensure_official_community()
        qs = Community.objects.select_related("creator").annotate(
            n_followers=Count("memberships", distinct=True),
            n_posts=Count("posts", distinct=True),
            latest_post_at=Max("posts__created_at"),
        )
        u = self.request.user
        if not _is_platform_admin(u):
            if u and u.is_authenticated:
                qs = qs.filter(Q(visibility=Community.Visibility.PUBLIC) | Q(memberships__user=u)).distinct()
            else:
                qs = qs.filter(visibility=Community.Visibility.PUBLIC)

        p = self.request.query_params
        cat = (p.get("category") or "").strip()
        if cat and cat != "All":
            qs = qs.filter(category=cat)

        q = (p.get("q") or p.get("search") or "").strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q) | Q(description__icontains=q) | Q(category__icontains=q) | Q(slug__icontains=q)
            )

        if p.get("mine") == "1" and u and u.is_authenticated:
            qs = qs.filter(memberships__user=u).distinct()

        sort = (p.get("sort") or "popular").strip()
        if sort == "recent":
            qs = qs.order_by("-latest_post_at", "-created_at")
        elif sort == "newest":
            qs = qs.order_by("-created_at")
        else:
            qs = qs.order_by("-is_official", "-n_followers", "-created_at")
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        comm = serializer.save(creator=self.request.user)
        CommunityMembership.objects.get_or_create(
            community=comm,
            user=self.request.user,
            defaults={"role": CommunityMembership.Role.OWNER, "notif_level": CommunityMembership.NotifLevel.ALL},
        )

    def partial_update(self, request, *args, **kwargs):
        comm = self.get_object()
        m = _get_membership(comm, request.user)
        if not (_is_platform_admin(request.user) or (m and m.can_manage())):
            return Response({"detail": "Only community owners or admins can update this community."}, status=403)
        return super().partial_update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        comm = self.get_object()
        if comm.is_official and not _is_platform_admin(request.user):
            return Response({"detail": "Official community cannot be deleted."}, status=403)
        m = _get_membership(comm, request.user)
        if not (_is_platform_admin(request.user) or (m and m.role == CommunityMembership.Role.OWNER)):
            return Response({"detail": "Only the community owner can delete this community."}, status=403)
        comm.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"])
    def categories(self, request):
        return Response([c[0] for c in Community.Category.choices])

    @action(detail=True, methods=["post", "delete"])
    def follow(self, request, slug=None):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in to follow communities."}, status=401)
        comm = self.get_object()
        if request.method == "POST":
            try:
                m, created = CommunityMembership.objects.get_or_create(
                    community=comm,
                    user=request.user,
                    defaults={"role": CommunityMembership.Role.FOLLOWER, "notif_level": CommunityMembership.NotifLevel.ALL},
                )
            except IntegrityError:
                m = CommunityMembership.objects.get(community=comm, user=request.user)
                created = False
            return Response(
                {
                    "is_following": True,
                    "followers_count": comm.memberships.count(),
                    "role": m.role,
                    "notif_level": m.notif_level,
                },
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        # DELETE unfollow
        m = _get_membership(comm, request.user)
        if m and m.role == CommunityMembership.Role.OWNER:
            return Response({"detail": "Community owners cannot unfollow their own community."}, status=400)
        if m:
            m.delete()
        return Response({"is_following": False, "followers_count": comm.memberships.count()})

    @action(detail=True, methods=["patch", "post"], url_path="notifications")
    def notifications_pref(self, request, slug=None):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in required."}, status=401)
        comm = self.get_object()
        m = _get_membership(comm, request.user)
        if not m:
            return Response({"detail": "Follow this community first to set notification preferences."}, status=400)
        level = request.data.get("notif_level")
        if level not in dict(CommunityMembership.NotifLevel.choices):
            return Response({"detail": "Invalid notif_level. Use 'all', 'important', or 'none'."}, status=400)
        m.notif_level = level
        m.save(update_fields=["notif_level"])
        return Response({"notif_level": m.notif_level})

    @action(detail=True, methods=["get"])
    def members(self, request, slug=None):
        comm = self.get_object()
        qs = comm.memberships.select_related("user", "user__department").order_by("role", "-joined_at")[:100]
        return Response(CommunityMemberSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def roles(self, request, slug=None):
        """Owner/Admin assigns or revokes moderator role."""
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in required."}, status=401)
        comm = self.get_object()
        my_m = _get_membership(comm, request.user)
        if not (_is_platform_admin(request.user) or (my_m and my_m.role == CommunityMembership.Role.OWNER)):
            return Response({"detail": "Only community owners can manage roles."}, status=403)
        target_id = request.data.get("user_id")
        new_role = request.data.get("role")
        if new_role not in (CommunityMembership.Role.FOLLOWER, CommunityMembership.Role.MODERATOR, CommunityMembership.Role.ADMIN):
            return Response({"detail": "Invalid role."}, status=400)
        target_m = get_object_or_404(CommunityMembership, community=comm, user_id=target_id)
        if target_m.role == CommunityMembership.Role.OWNER:
            return Response({"detail": "Cannot change the owner's role."}, status=400)
        target_m.role = new_role
        target_m.save(update_fields=["role"])
        notify(
            target_m.user,
            notif_type=Notification.Type.COMMUNITY,
            text=f"You are now a {new_role} in {comm.name}.",
            actor=request.user,
            link=f"/communities/{comm.slug}",
        )
        return Response(CommunityMemberSerializer(target_m, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"])
    def posts(self, request, slug=None):
        comm = self.get_object()
        if request.method == "GET":
            qs = comm.posts.select_related("author", "author__department")
            sort = request.query_params.get("sort", "recent")
            if sort == "popular":
                qs = qs.annotate(n_likes=Count("likes_set")).order_by("-n_likes", "-created_at")
            elif sort == "important":
                qs = qs.filter(is_important=True).order_by("-created_at")
            else:
                qs = qs.order_by("-created_at")
            page = self.paginate_queryset(qs)
            if page is not None:
                ser = CommunityPostSerializer(page, many=True, context={"request": request})
                return self.get_paginated_response(ser.data)
            return Response(CommunityPostSerializer(qs, many=True, context={"request": request}).data)

        # POST — Channel-style publishing: ONLY owner/admin/moderator (or platform admin)
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in required."}, status=401)
        m = _get_membership(comm, request.user)
        if not (_is_platform_admin(request.user) or (m and m.can_publish())):
            return Response(
                {"detail": "Only community owners, admins, or moderators can publish announcements here."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = CommunityPostSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        post = ser.save(community=comm, author=request.user)

        # Notify followers respecting their notification preferences
        if post.is_important:
            recipients = comm.memberships.filter(
                notif_level__in=[CommunityMembership.NotifLevel.ALL, CommunityMembership.NotifLevel.IMPORTANT]
            ).select_related("user")
        else:
            recipients = comm.memberships.filter(
                notif_level=CommunityMembership.NotifLevel.ALL
            ).select_related("user")

        snippet = (post.title or post.body)[:70]
        for mem in recipients:
            if mem.user_id != request.user.pk:
                notify(
                    mem.user,
                    notif_type=Notification.Type.COMMUNITY,
                    text=f"New post in {comm.name}: {snippet}",
                    actor=request.user,
                    link=f"/communities/{comm.slug}",
                    dedupe_seconds=60,
                )

        return Response(CommunityPostSerializer(post, context={"request": request}).data, status=201)


class CommunityPostViewSet(viewsets.GenericViewSet):
    """
    PATCH/DELETE /api/community-posts/{id}/
    POST         /api/community-posts/{id}/like/
    GET/POST     /api/community-posts/{id}/comments/
    POST         /api/community-posts/{id}/report/
    """

    queryset = CommunityPost.objects.select_related("community", "author", "author__department")
    serializer_class = CommunityPostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def _can_manage(self, user, post):
        if _is_platform_admin(user) or post.author_id == user.pk:
            return True
        m = _get_membership(post.community, user)
        return bool(m and m.can_manage())

    def partial_update(self, request, pk=None):
        post = self.get_object()
        if not self._can_manage(request.user, post):
            return Response({"detail": "You cannot edit this post."}, status=403)
        ser = CommunityPostSerializer(post, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save(edited_at=timezone.now())
        return Response(ser.data)

    def destroy(self, request, pk=None):
        post = self.get_object()
        if not self._can_manage(request.user, post):
            return Response({"detail": "You cannot delete this post."}, status=403)
        post.delete()
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in required."}, status=401)
        post = self.get_object()
        like, created = CommunityPostLike.objects.get_or_create(post=post, user=request.user)
        if not created:
            like.delete()
        elif post.author_id != request.user.pk:
            notify(
                post.author,
                notif_type=Notification.Type.LIKE,
                text=f"{request.user.display_name} liked your post in {post.community.name}.",
                actor=request.user,
                link=f"/communities/{post.community.slug}",
            )
        return Response({"likes": post.likes_set.count(), "liked": created})

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        post = self.get_object()
        if request.method == "GET":
            qs = post.comments.filter(parent__isnull=True).select_related("author", "author__department").order_by("-created_at")
            return Response(CommunityPostCommentSerializer(qs, many=True, context={"request": request}).data)

        if not request.user.is_authenticated:
            return Response({"detail": "Sign in to comment."}, status=401)
        body_html = sanitize_rich_html(request.data.get("body_html", ""))
        body = (request.data.get("body") or strip_html_to_text(body_html)).strip()
        if not body:
            return Response({"detail": "Comment cannot be empty."}, status=400)
        parent = None
        parent_id = request.data.get("parent")
        if parent_id:
            parent = get_object_or_404(CommunityPostComment, pk=parent_id, post=post)
            if parent.parent_id is not None:
                parent = parent.parent  # keep 2-level clean threads
        comment = CommunityPostComment.objects.create(
            post=post, author=request.user, parent=parent, body=body, body_html=body_html
        )
        if parent and parent.author_id != request.user.pk:
            notify(
                parent.author,
                notif_type=Notification.Type.COMMENT,
                text=f"{request.user.display_name} replied to your comment in {post.community.name}.",
                actor=request.user,
                link=f"/communities/{post.community.slug}",
            )
        elif post.author_id != request.user.pk:
            notify(
                post.author,
                notif_type=Notification.Type.COMMENT,
                text=f"{request.user.display_name} commented on your post in {post.community.name}.",
                actor=request.user,
                link=f"/communities/{post.community.slug}",
            )
        return Response(CommunityPostCommentSerializer(comment, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in required."}, status=401)
        post = self.get_object()
        reason = (request.data.get("reason") or "").strip()[:255]
        if len(reason) < 5:
            return Response({"detail": "Please provide a brief reason for your report."}, status=400)
        CommunityPostReport.objects.create(post=post, reporter=request.user, reason=reason)
        return Response({"detail": "Report submitted for review."}, status=201)
