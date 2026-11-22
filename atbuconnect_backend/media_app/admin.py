from django.contrib import admin

from .models import MediaComment, MediaLike, MediaPost


@admin.register(MediaPost)
class MediaPostAdmin(admin.ModelAdmin):
    list_display = ["author", "type", "caption", "created_at"]
    list_filter = ["type"]


admin.site.register(MediaLike)
admin.site.register(MediaComment)
