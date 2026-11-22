from django.apps import AppConfig


class LibraryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "library"
    verbose_name = "Academic PDF Library"

    def ready(self):
        from config import checks  # noqa: F401  (registers the production safety checks)
