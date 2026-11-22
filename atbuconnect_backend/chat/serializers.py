from django.utils.timesince import timesince
from rest_framework import serializers

from accounts.serializers import UserPublicSerializer

from .models import Conversation, Message, SavedChatQuestion


class MessageSerializer(serializers.ModelSerializer):
    sender_info = UserPublicSerializer(source="sender", read_only=True)
    is_mine = serializers.SerializerMethodField()
    is_sug = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "conversation", "sender", "sender_info", "is_mine", "is_sug",
            "body", "attachment_url", "attachment_name", "attachment_size",
            "is_read", "read_at", "time", "created_at", "saved",
        ]
        read_only_fields = fields

    def _viewer(self):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        return u if (u and u.is_authenticated) else None

    def get_is_mine(self, obj):
        u = self._viewer()
        return bool(u and obj.sender_id == u.pk)

    def get_is_sug(self, obj):
        return obj.sender_id == obj.conversation.sug_rep_id

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        req = self.context.get("request")
        url = obj.attachment.url
        return req.build_absolute_uri(url) if req else url

    def get_time(self, obj):
        return f"{timesince(obj.created_at).split(',')[0]} ago"

    def get_saved(self, obj):
        u = self._viewer()
        return bool(u and obj.saved_by.filter(user=u).exists())


class ConversationSerializer(serializers.ModelSerializer):
    student_info = UserPublicSerializer(source="student", read_only=True)
    sug_info = UserPublicSerializer(source="sug_rep", read_only=True)
    counterpart = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    updated_time = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "student", "sug_rep", "student_info", "sug_info", "counterpart",
            "status", "last_message", "unread_count", "updated_time", "updated_at", "created_at",
        ]
        read_only_fields = fields

    def _viewer(self):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        return u if (u and u.is_authenticated) else None

    def get_counterpart(self, obj):
        u = self._viewer()
        other = obj.student if (u and u.pk == obj.sug_rep_id) else obj.sug_rep
        data = UserPublicSerializer(other, context=self.context).data
        data["title"] = getattr(other, "title", "") or ""
        data["online"] = bool(getattr(other, "is_online", False))
        return data

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at", "-id").first()
        if not msg:
            return None
        return {
            "id": msg.id,
            "body": msg.body[:120] if msg.body else (f"Attachment: {msg.attachment_name}" if msg.attachment_name else ""),
            "sender_id": msg.sender_id,
            "created_at": msg.created_at.isoformat(),
            "time": f"{timesince(msg.created_at).split(',')[0]} ago",
        }

    def get_unread_count(self, obj):
        u = self._viewer()
        if not u:
            return 0
        return obj.messages.filter(is_read=False).exclude(sender=u).count()

    def get_updated_time(self, obj):
        return f"{timesince(obj.updated_at).split(',')[0]} ago"


class SavedChatQuestionSerializer(serializers.ModelSerializer):
    message_data = MessageSerializer(source="message", read_only=True)
    conversation_id = serializers.IntegerField(source="message.conversation_id", read_only=True)

    class Meta:
        model = SavedChatQuestion
        fields = ["id", "message", "conversation_id", "message_data", "note", "created_at"]
        read_only_fields = ["id", "conversation_id", "message_data", "created_at"]
