import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

User = settings.AUTH_USER_MODEL


def community_avatar_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"communities/avatars/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


def community_cover_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"communities/covers/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


def community_post_media_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"communities/posts/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class Community(models.Model):
    class Category(models.TextChoices):
        ACADEMICS = "Academics", "Academics"
        TECHNOLOGY = "Technology", "Technology"
        SPORTS = "Sports", "Sports"
        ENTERTAINMENT = "Entertainment", "Entertainment"
        ARTS = "Arts and Culture", "Arts and Culture"
        ENTREPRENEURSHIP = "Entrepreneurship", "Entrepreneurship"
        CAMPUS_LIFE = "Campus Life", "Campus Life"
        FACULTY = "Faculty and Departments", "Faculty and Departments"
        OTHER = "Other Interests", "Other Interests"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(max_length=1200)
    category = models.CharField(max_length=40, choices=Category.choices, default=Category.CAMPUS_LIFE, db_index=True)
    avatar = models.ImageField(upload_to=community_avatar_path, blank=True, null=True)
    cover_image = models.ImageField(upload_to=community_cover_path, blank=True, null=True)
    accent_color = models.CharField(max_length=7, default="#2563EB")
    visibility = models.CharField(max_length=10, choices=Visibility.choices, default=Visibility.PUBLIC)
    rules = models.TextField(blank=True, max_length=3000)
    is_official = models.BooleanField(default=False)
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_communities")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_official", "-created_at"]
        verbose_name_plural = "Communities"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:120] or "community"
            cand, n = base, 1
            while Community.objects.exclude(pk=self.pk).filter(slug=cand).exists():
                n += 1
                cand = f"{base}-{n}"
            self.slug = cand
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class CommunityMembership(models.Model):
    class Role(models.TextChoices):
        FOLLOWER = "follower", "Follower"
        MODERATOR = "moderator", "Moderator"
        ADMIN = "admin", "Admin"
        OWNER = "owner", "Owner"

    class NotifLevel(models.TextChoices):
        ALL = "all", "All posts"
        IMPORTANT = "important", "Important updates only"
        NONE = "none", "Muted"

    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="community_memberships")
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.FOLLOWER)
    notif_level = models.CharField(max_length=12, choices=NotifLevel.choices, default=NotifLevel.ALL)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("community", "user")
        ordering = ["-joined_at"]

    def can_publish(self):
        return self.role in (self.Role.OWNER, self.Role.ADMIN, self.Role.MODERATOR)

    def can_manage(self):
        return self.role in (self.Role.OWNER, self.Role.ADMIN)

    def __str__(self):
        return f"{self.user} in {self.community} ({self.role})"


class CommunityPost(models.Model):
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name="posts")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="community_posts")
    title = models.CharField(max_length=240, blank=True)
    body = models.TextField()
    body_html = models.TextField(blank=True)
    is_important = models.BooleanField(default=False)
    image = models.ImageField(upload_to=community_post_media_path, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.community.name}: {(self.title or self.body)[:40]}"


class CommunityPostLike(models.Model):
    post = models.ForeignKey(CommunityPost, on_delete=models.CASCADE, related_name="likes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="community_post_likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("post", "user")


class CommunityPostComment(models.Model):
    post = models.ForeignKey(CommunityPost, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="community_comments")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies")
    body = models.TextField()
    body_html = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class CommunityPostReport(models.Model):
    post = models.ForeignKey(CommunityPost, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="community_reports")
    reason = models.CharField(max_length=255)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
