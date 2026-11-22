from django.contrib import admin

from .models import (
    Community, CommunityMembership, CommunityPost, CommunityPostComment, CommunityPostReport,
)


@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "category", "visibility", "is_official", "creator", "created_at"]
    list_filter = ["category", "visibility", "is_official"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(CommunityMembership)
class CommunityMembershipAdmin(admin.ModelAdmin):
    list_display = ["community", "user", "role", "notif_level", "joined_at"]
    list_filter = ["role", "notif_level"]
    search_fields = ["community__name", "user__username"]


@admin.register(CommunityPost)
class CommunityPostAdmin(admin.ModelAdmin):
    list_display = ["community", "author", "title", "is_important", "created_at"]
    list_filter = ["is_important", "community"]
    search_fields = ["title", "body"]


@admin.register(CommunityPostComment)
class CommunityPostCommentAdmin(admin.ModelAdmin):
    list_display = ["post", "author", "created_at"]


@admin.register(CommunityPostReport)
class CommunityPostReportAdmin(admin.ModelAdmin):
    list_display = ["post", "reporter", "reason", "resolved", "created_at"]
    list_filter = ["resolved"]
