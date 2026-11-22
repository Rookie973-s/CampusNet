from django.utils.timesince import timesince
from rest_framework import serializers

from accounts.serializers import UserPublicSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    time = serializers.SerializerMethodField()
    actor = UserPublicSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type", "text", "link", "read", "time", "actor", "question", "answer", "created_at"]

    def get_time(self, obj):
        return f"{timesince(obj.created_at).split(',')[0]} ago"
