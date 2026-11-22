"""Library settings with safe defaults - override any of them in settings.py / the environment."""
from django.conf import settings


def get(name, default):
    return getattr(settings, name, default)


MAX_PDF_BYTES = lambda: int(get("LIBRARY_MAX_PDF_BYTES", 15 * 1024 * 1024))
LEVELS = lambda: list(get("LIBRARY_LEVELS", [100, 200, 300, 400, 500, 600]))
PAGE_SIZE = lambda: int(get("LIBRARY_PAGE_SIZE", 12))
# Non-registered users cannot browse or download PDFs; both require a signed-in account.
REQUIRE_LOGIN_TO_BROWSE = lambda: bool(get("LIBRARY_REQUIRE_LOGIN_TO_BROWSE", True))
REQUIRE_LOGIN_TO_DOWNLOAD = lambda: bool(get("LIBRARY_REQUIRE_LOGIN_TO_DOWNLOAD", True))
