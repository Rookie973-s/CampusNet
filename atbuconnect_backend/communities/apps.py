from django.apps import AppConfig


class CommunitiesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "communities"

    def ready(self):
        from django.contrib.auth import get_user_model
        from django.db.models.signals import post_save

        User = get_user_model()
        post_save.connect(_on_user_created, sender=User, dispatch_uid="communities_auto_follow_official")


def _on_user_created(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from .services import auto_follow_official_community
        auto_follow_official_community(instance)
    except Exception:
        # Never block user creation (e.g. during migrations before communities tables exist)
        pass
