import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL


def chat_attachment_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin")[:8]
    return f"chat_attachments/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class Conversation(models.Model):
    """Strictly a conversation between a student and an authorized SUG / Staff representative.

    Student-to-student DMs are intentionally disallowed by both schema constraints and API checks.
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        ARCHIVED = "archived", "Archived"

    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="student_conversations")
    sug_rep = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sug_conversations")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["student", "sug_rep"], name="unique_student_sug_convo"),
            models.CheckConstraint(
                condition=~models.Q(student=models.F("sug_rep")), name="no_self_chat"
            ),
        ]

    def __str__(self):
        return f"Chat({self.student} <-> {self.sug_rep})"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_chat_messages")
    body = models.TextField(blank=True, max_length=4000)
    attachment = models.FileField(upload_to=chat_attachment_path, blank=True, null=True)
    attachment_name = models.CharField(max_length=200, blank=True)
    attachment_size = models.PositiveIntegerField(default=0)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"Msg #{self.pk} by {self.sender}"


class SavedChatQuestion(models.Model):
    """Allows users to save important questions/answers within their SUG chat threads."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_chat_questions")
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="saved_by")
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "message")
        ordering = ["-created_at"]
