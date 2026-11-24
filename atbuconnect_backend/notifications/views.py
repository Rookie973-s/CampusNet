from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification, PushToken
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/notifications/                GET — current user's notifications (NotifDropdown)
    /api/notifications/{id}/read/      POST — mark one read
    /api/notifications/mark_all_read/  POST — mark all read
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notif = self.get_object()
        notif.read = True
        notif.save(update_fields=["read"])
        return Response(NotificationSerializer(notif).data)

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read=False).count()})

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        self.get_queryset().update(read=True)
        return Response({"detail": "all marked read"})

    @action(detail=False, methods=["delete", "post"], url_path="clear_all")
    def clear_all(self, request):
        deleted, _ = self.get_queryset().delete()
        return Response({"detail": "all notifications deleted", "deleted": deleted})

    @action(detail=False, methods=["post", "delete"], url_path="device-token")
    def device_token(self, request):
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"detail": "token is required"}, status=400)
        if request.method == "DELETE":
            PushToken.objects.filter(user=request.user, token=token).delete()
            return Response({"detail": "device token removed"})
        platform = (request.data.get("platform") or "android").strip()[:20]
        PushToken.objects.update_or_create(
            token=token,
            defaults={"user": request.user, "platform": platform},
        )
        return Response({"detail": "device token registered"})
