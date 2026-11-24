from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Notification(models.Model):
    class Type(models.TextChoices):
        ANSWER = "answer", "New answer"
        COMMENT = "comment", "New comment or reply"
        LIKE = "like", "Like or upvote"
        MENTION = "mention", "Mention"
        FOLLOW = "follow", "New follower"
        WELCOME = "welcome", "Welcome"
        POST_FROM_FOLLOWED = "followed_post", "New post from followed account"
        STAFF = "staff", "SUG / Staff application update"
        CLASS_REP = "class_rep", "Class representative status"
        VERIFICATION = "verification", "Student verification update"
        COMMUNITY = "community", "Community activity"
        CHAT = "chat", "SUG message"
        SYSTEM = "system", "System"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="triggered_notifications"
    )
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.SYSTEM)
    text = models.CharField(max_length=255)
    link = models.CharField(max_length=255, blank=True)
    question = models.ForeignKey(
        "questions.Question", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    answer = models.ForeignKey(
        "questions.Answer", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user}: {self.text[:40]}"


class PushToken(models.Model):
    """Stores Expo / FCM native mobile push tokens per user device."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_tokens")
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=20, blank=True, default="android")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user} ({self.platform}): {self.token[:24]}"
