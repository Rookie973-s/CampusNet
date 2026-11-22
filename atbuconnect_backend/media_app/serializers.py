from django.utils.timesince import timesince
from rest_framework import serializers

from accounts.serializers import UserPublicSerializer

from .models import MediaComment, MediaPost


def human_time(dt):
    return f"{timesince(dt).split(',')[0]} ago"


class MediaCommentSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(source="author", read_only=True)
    time = serializers.SerializerMethodField()

    class Meta:
        model = MediaComment
        fields = ["id", "post", "user", "body", "time"]
        read_only_fields = ["id", "post", "user", "time"]

    def get_time(self, obj):
        return human_time(obj.created_at)


class MediaPostSerializer(serializers.ModelSerializer):
    user = UserPublicSerializer(source="author", read_only=True)
    av = serializers.CharField(source="author.initials", read_only=True)
    bg = serializers.CharField(source="author.avatar_bg", read_only=True)
    time = serializers.SerializerMethodField()
    likes = serializers.IntegerField(read_only=True)
    comments = serializers.IntegerField(source="comments_count", read_only=True)
    liked = serializers.SerializerMethodField()

    class Meta:
        model = MediaPost
        fields = [
            "id", "user", "av", "bg", "type", "thumb", "video_url",
            "caption", "time", "likes", "comments", "liked",
        ]
        read_only_fields = ["id", "likes", "comments"]

    def get_time(self, obj):
        return human_time(obj.created_at)

    def get_liked(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.likes_set.filter(user=user).exists())

    def create(self, validated_data):
        return MediaPost.objects.create(author=self.context["request"].user, **validated_data)
