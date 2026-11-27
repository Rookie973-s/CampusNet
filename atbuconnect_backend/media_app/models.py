from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class MediaPost(models.Model):
    class Type(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Video"

    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="media_posts")
    type = models.CharField(max_length=5, choices=Type.choices, default=Type.PHOTO)
    thumb = models.ImageField(upload_to="media_posts/", blank=True, null=True)
    video_url = models.URLField(blank=True, help_text="Only used when type=video")
    caption = models.CharField(max_length=280, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.type} by {self.author} @ {self.created_at:%Y-%m-%d}"

    @property
    def likes(self):
        return self.likes_set.count()

    @property
    def comments_count(self):
        return self.comments.count()


class MediaLike(models.Model):
    post = models.ForeignKey(MediaPost, on_delete=models.CASCADE, related_name="likes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="media_likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("post", "user")


class MediaComment(models.Model):
    post = models.ForeignKey(MediaPost, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="media_comments")
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class StoredMediaFile(models.Model):
    """Database-backed persistent media blob so uploaded avatars, post photos,
    community covers, ad creatives, and private PDFs stay 100% synced across
    all devices, platforms, workers, and Render restarts without ephemeral disk loss."""

    name = models.CharField(max_length=255, unique=True, db_index=True)
    content_type = models.CharField(max_length=120, default="application/octet-stream")
    data = models.BinaryField()
    size = models.PositiveIntegerField(default=0)
    is_private = models.BooleanField(default=False, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.size} bytes)"
