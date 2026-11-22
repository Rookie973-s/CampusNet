from django.contrib import admin

from .models import Conversation, Message, SavedChatQuestion


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "student", "sug_rep", "status", "updated_at"]
    list_filter = ["status"]
    search_fields = ["student__username", "sug_rep__username"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "sender", "is_read", "created_at"]
    list_filter = ["is_read"]


@admin.register(SavedChatQuestion)
class SavedChatQuestionAdmin(admin.ModelAdmin):
    list_display = ["user", "message", "created_at"]
