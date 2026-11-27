from django.utils import timezone

from accounts.entitlements import get_entitlements, is_admin_or_mod


def is_moderator(user):
    """Administrators keep separate moderation rights over any post."""
    return is_admin_or_mod(user)


def can_delete_question(user, question, now=None):
    """Ordinary owner: within 24 h of server-side creation time.
    Verified student owner: anytime.
    Moderators/admins: always."""
    if not (user and user.is_authenticated):
        return False
    if is_moderator(user):
        return True
    if question.author_id != user.id:
        return False
    if get_entitlements(user)["can_delete_own_posts_anytime"]:
        return True
    return question.owner_can_delete(now or timezone.now())


def can_edit_question(user, question):
    """ONLY the post's own author (if verified student, verified SUG, or admin) may edit their post.
    No user — not even verified students, SUG officials, or moderators — can edit another user's post."""
    if not (user and user.is_authenticated):
        return False
    if question.author_id != user.id:
        return False
    return get_entitlements(user)["can_edit_own_posts"]
