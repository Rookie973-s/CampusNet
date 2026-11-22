"""Centralized account entitlements for ordinary vs. student-verified vs. staff/admin users.

All verified-user benefits (editing posts, unlimited delete window, longer posts,
username change exemption, comment ranking preference, ad-free toggle) live here so
permissions and limits are never duplicated across views or serializers.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

ORDINARY_MAX_POST_WORDS = getattr(settings, "ORDINARY_MAX_POST_WORDS", 300)
VERIFIED_MAX_POST_WORDS = getattr(settings, "VERIFIED_MAX_POST_WORDS", 1200)
ORDINARY_MAX_POST_CHARS = getattr(settings, "ORDINARY_MAX_POST_CHARS", 2500)
VERIFIED_MAX_POST_CHARS = getattr(settings, "VERIFIED_MAX_POST_CHARS", 10000)
USERNAME_COOLDOWN_DAYS = getattr(settings, "USERNAME_COOLDOWN_DAYS", 14)
VERIFIED_COMMENT_BOOST = getattr(settings, "VERIFIED_COMMENT_BOOST", 1.5)


def is_verified_student(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "is_verified_student", False))


def is_admin_or_mod(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or user.is_staff or getattr(user, "role", None) == "admin")
    )


def get_entitlements(user) -> dict:
    verified = is_verified_student(user)
    admin = is_admin_or_mod(user)
    privileged = verified or admin
    return {
        "is_verified_student": verified,
        "can_edit_own_posts": privileged,
        "can_delete_own_posts_anytime": privileged,
        "max_post_words": VERIFIED_MAX_POST_WORDS if privileged else ORDINARY_MAX_POST_WORDS,
        "max_post_chars": VERIFIED_MAX_POST_CHARS if privileged else ORDINARY_MAX_POST_CHARS,
        "exempt_from_username_cooldown": privileged,
        "username_cooldown_days": 0 if privileged else USERNAME_COOLDOWN_DAYS,
        "can_hide_ads": privileged,
        "hide_ads": bool(privileged and getattr(user, "hide_ads", False)),
        "comment_rank_boost": VERIFIED_COMMENT_BOOST if verified else 0.0,
    }


def can_change_username(user, now=None):
    """Returns (allowed: bool, next_allowed_at: datetime | None)."""
    ent = get_entitlements(user)
    if ent["exempt_from_username_cooldown"]:
        return True, None
    last_changed = getattr(user, "username_changed_at", None)
    if not last_changed:
        return True, None
    now = now or timezone.now()
    next_at = last_changed + timedelta(days=USERNAME_COOLDOWN_DAYS)
    if now >= next_at:
        return True, None
    return False, next_at
