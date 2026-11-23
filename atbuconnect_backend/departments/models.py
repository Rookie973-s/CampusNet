from django.db import models


class Department(models.Model):
    """Faculty/department shown in HomePage, FeedPage sidebar, ApplyPage select."""

    name = models.CharField(max_length=120, unique=True)
    color = models.CharField(max_length=7, default="#3B82F6")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "Academic Faculty"
        verbose_name_plural = "Academic Faculties"

    def __str__(self):
        return self.name

    @property
    def count(self):
        """Number of questions asked in this department — matches the
        `d.count` badge used throughout the frontend."""
        return self.questions.count()
