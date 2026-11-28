from django.contrib import admin, messages

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
    actions = ["takedown_selected_posts"]

    @admin.action(description="Take down selected posts (notify authors in-app + email)")
    def takedown_selected_posts(self, request, queryset):
        from accounts.email_utils import send_platform_email
        from notifications.models import Notification
        from notifications.services import notify
        reason = "Violation of CampusNetwork community guidelines."
        count = 0
        for q in list(queryset.select_related("author")):
            snippet = (q.title or q.body or f"Post #{q.pk}")[:80]
            notify(
                q.author,
                notif_type=Notification.Type.SYSTEM,
                text=f"Your post “{snippet}” was removed by an administrator. Reason: {reason}",
                actor=request.user,
                link="/feed",
                dedupe_seconds=0,
            )
            send_platform_email(
                recipient_email=q.author.email,
                subject="CampusNetwork (Cenet): Your Post Was Taken Down",
                message=(
                    f"Hello {q.author.display_name},\n\n"
                    f"Your post (“{snippet}”) was taken down by a CampusNetwork administrator.\n"
                    f"Reason: {reason}\n\n— CampusNetwork (Cenet)"
                ),
                allow_formsubmit=True,
            )
            q.delete()
            count += 1
        self.message_user(request, f"{count} post(s) taken down and authors notified.", messages.WARNING)


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
