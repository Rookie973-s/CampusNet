"""Centralized notification creation with deduplication so events are recorded reliably
on the backend without spamming duplicate rows."""

from datetime import timedelta

from django.utils import timezone

from .models import Notification


def notify(
    user,
    *,
    notif_type: str,
    text: str,
    actor=None,
    link: str = "",
    question=None,
    answer=None,
    dedupe_seconds: int = 300,
):
    """Create a notification unless an identical unread one was just created.

    Never notifies a user about their own action (unless actor is None, e.g. welcome/system).
    """
    if user is None:
        return None
    if actor is not None and actor.pk == user.pk:
        return None

    clean_text = (text or "").strip()[:255]
    if not clean_text:
        return None

    if dedupe_seconds > 0:
        since = timezone.now() - timedelta(seconds=dedupe_seconds)
        dup_qs = Notification.objects.filter(
            user=user,
            type=notif_type,
            text=clean_text,
            link=link[:255],
            created_at__gte=since,
        )
        if actor is not None:
            dup_qs = dup_qs.filter(actor=actor)
        if dup_qs.exists():
            return None

    return Notification.objects.create(
        user=user,
        actor=actor,
        type=notif_type,
        text=clean_text,
        link=link[:255],
        question=question,
        answer=answer,
    )
