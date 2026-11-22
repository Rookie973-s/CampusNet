from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import MediaComment, MediaLike, MediaPost
from .serializers import MediaCommentSerializer, MediaPostSerializer


class IsAuthorOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.author == request.user


class MediaPostViewSet(viewsets.ModelViewSet):
    """
    /api/media/                GET list, POST create (multipart: thumb, caption, type)
    /api/media/{id}/like/      POST toggle like
    /api/media/{id}/comments/  GET list / POST add comment
    """

    queryset = MediaPost.objects.select_related("author")
    serializer_class = MediaPostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [permissions.IsAuthenticatedOrReadOnly(), IsAuthorOrReadOnly()]
        return [permissions.IsAuthenticatedOrReadOnly()]

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        post = self.get_object()
        like, created = MediaLike.objects.get_or_create(post=post, user=request.user)
        if not created:
            like.delete()
        return Response({"likes": post.likes, "liked": created})

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        post = self.get_object()
        if request.method == "GET":
            qs = post.comments.select_related("author")
            return Response(MediaCommentSerializer(qs, many=True, context={"request": request}).data)

        if not request.user.is_authenticated:
            return Response({"detail": "Sign in to comment."}, status=401)
        body = request.data.get("body", "").strip()
        if not body:
            return Response({"detail": "body is required."}, status=400)
        comment = MediaComment.objects.create(post=post, author=request.user, body=body)
        return Response(MediaCommentSerializer(comment, context={"request": request}).data, status=201)
