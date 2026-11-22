from django.contrib import admin

from .models import (
    Answer, AnswerLike, AnswerReaction, AnswerVote, ContentReport, Mention,
    PostView, Question, QuestionBookmark, QuestionEditHistory, QuestionLike,
    QuestionMedia, QuestionVote, Tag,
)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ["title", "author", "department", "views", "is_promoted", "promoted_until", "created_at"]
    list_filter = ["department", "tags", "is_promoted"]
    search_fields = ["title", "body"]


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ["question", "author", "created_at"]


admin.site.register(Tag)
admin.site.register(QuestionVote)
admin.site.register(QuestionLike)
admin.site.register(QuestionBookmark)
admin.site.register(AnswerLike)
admin.site.register(AnswerReaction)
admin.site.register(AnswerVote)
admin.site.register(Mention)
admin.site.register(PostView)
admin.site.register(QuestionEditHistory)
admin.site.register(ContentReport)


@admin.register(QuestionMedia)
class QuestionMediaAdmin(admin.ModelAdmin):
    list_display = ["question", "kind", "size_bytes", "duration", "created_at"]
    list_filter = ["kind"]
