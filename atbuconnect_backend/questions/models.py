import secrets
import string
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL

_BASE62 = string.ascii_letters + string.digits


def generate_public_id(length: int = 8) -> str:
    """Cryptographically random URL-safe base62 ID (e.g. wT9jsmhs) — ~218 trillion combinations."""
    return "".join(secrets.choice(_BASE62) for _ in range(length))


class Tag(models.Model):
    name = models.CharField(max_length=60, unique=True)

    def __str__(self):
        return self.name


class Question(models.Model):
    public_id = models.CharField(max_length=16, unique=True, db_index=True, blank=True, default="")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="questions")
    department = models.ForeignKey(
        "departments.Department", on_delete=models.SET_NULL, null=True,
        related_name="questions",
    )
    title = models.CharField(max_length=300)
    body = models.TextField()
    body_html = models.TextField(blank=True)
    tags = models.ManyToManyField(Tag, related_name="questions", blank=True)
    views = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    # Promotion is set by administrators only (never by the client).
    is_promoted = models.BooleanField(default=False)
    promoted_until = models.DateTimeField(null=True, blank=True, help_text="Leave empty for no end date.")

    # Ordinary authors may delete their own post only for this long after it was created.
    OWNER_DELETE_WINDOW = timedelta(hours=24)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.public_id:
            for _ in range(10):
                cand = generate_public_id(8)
                if not Question.objects.filter(public_id=cand).exists():
                    self.public_id = cand
                    break
        super().save(*args, **kwargs)

    @property
    def promoted(self):
        if not self.is_promoted:
            return False
        return self.promoted_until is None or self.promoted_until > timezone.now()

    @property
    def owner_delete_deadline(self):
        return self.created_at + self.OWNER_DELETE_WINDOW

    def owner_can_delete(self, now=None):
        return (now or timezone.now()) <= self.owner_delete_deadline

    @property
    def votes(self):
        up = self.votes_set.filter(direction="up").count()
        down = self.votes_set.filter(direction="down").count()
        return up - down

    @property
    def likes(self):
        return self.likes_set.count()

    @property
    def ans_count(self):
        return self.answers.count()

    @property
    def is_answered(self):
        return self.answers.exists()


class QuestionEditHistory(models.Model):
    """Audit trail when a verified student edits their own post."""
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="edit_history")
    editor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    previous_title = models.CharField(max_length=300)
    previous_body = models.TextField()
    edited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-edited_at"]


class PostView(models.Model):
    """Genuine deduplicated post views (per authenticated user or hashed IP)."""
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="post_views")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="viewed_questions")
    ip_hash = models.CharField(max_length=64, db_index=True)
    viewed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["question", "user", "viewed_at"]),
            models.Index(fields=["question", "ip_hash", "viewed_at"]),
        ]


class QuestionVote(models.Model):
    UP, DOWN = "up", "down"
    DIRECTIONS = [(UP, "Up"), (DOWN, "Down")]

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="votes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="question_votes")
    direction = models.CharField(max_length=4, choices=DIRECTIONS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("question", "user")


class QuestionLike(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="likes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="question_likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("question", "user")


class QuestionBookmark(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="bookmarks")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_questions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("question", "user")


def answer_image_path(instance, filename):
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg")[:5]
    return f"answers/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class Answer(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="answers")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies"
    )
    body = models.TextField()
    body_html = models.TextField(blank=True)
    image = models.ImageField(upload_to=answer_image_path, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Answer by {self.author} on {self.question_id}"

    @property
    def likes(self):
        return self.likes_set.count()

    @property
    def upvotes_count(self):
        return self.votes_set.filter(direction=AnswerVote.UP).count()

    @property
    def downvotes_count(self):
        return self.votes_set.filter(direction=AnswerVote.DOWN).count()

    def reaction_counts(self):
        counts = {"fire": 0, "bulb": 0, "clap": 0}
        for row in self.reactions.values("kind").annotate(n=models.Count("id")):
            counts[row["kind"]] = row["n"]
        return counts


class AnswerVote(models.Model):
    UP, DOWN = "up", "down"
    DIRECTIONS = [(UP, "Up"), (DOWN, "Down")]

    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name="votes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="answer_votes")
    direction = models.CharField(max_length=4, choices=DIRECTIONS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("answer", "user")


class AnswerLike(models.Model):
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name="likes_set")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="answer_likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("answer", "user")


class AnswerReaction(models.Model):
    FIRE, BULB, CLAP = "fire", "bulb", "clap"
    KINDS = [(FIRE, "Fire"), (BULB, "Bulb"), (CLAP, "Clap")]

    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="answer_reactions")
    kind = models.CharField(max_length=4, choices=KINDS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("answer", "user", "kind")


class Mention(models.Model):
    """Persisted @username reference inside a question or comment/answer."""
    mentioned_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mentions_received")
    actor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mentions_made")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, null=True, blank=True, related_name="mentions")
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, null=True, blank=True, related_name="mentions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ContentReport(models.Model):
    """Abuse / moderation reports for questions or comments."""
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="content_reports")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, null=True, blank=True, related_name="reports")
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, null=True, blank=True, related_name="reports")
    reason = models.CharField(max_length=255)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


def question_media_path(instance, filename):
    ext = {"image": ".img", "video": ".mp4"}.get(instance.kind, ".bin")
    return f"questions/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


class QuestionMedia(models.Model):
    IMAGE, VIDEO = "image", "video"
    KINDS = [(IMAGE, "Image"), (VIDEO, "Video")]

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(max_length=5, choices=KINDS)
    file = models.FileField(upload_to=question_media_path)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration = models.FloatField(null=True, blank=True, help_text="Seconds (videos only).")
    size_bytes = models.PositiveIntegerField(default=0)
    position = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.kind} for question {self.question_id}"


from django.db.models.signals import post_delete  # noqa: E402
from django.dispatch import receiver  # noqa: E402


@receiver(post_delete, sender=QuestionMedia)
def _delete_media_file(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(save=False)
