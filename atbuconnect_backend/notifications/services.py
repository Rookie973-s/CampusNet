"""Centralized notification creation with deduplication and async Expo Push delivery."""

import json
import logging
import threading
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Notification, PushToken

logger = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _dispatch_expo_push(tokens, title, body, data):
    """Fire-and-forget Expo Push API call in a daemon thread so requests never block."""
    if not tokens:
        return
    messages = [
        {
            "to": tok,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data,
            "priority": "high",
        }
        for tok in tokens
        if tok.startswith("ExponentPushToken[") or tok.startswith("ExpoPushToken[")
    ]
    if not messages:
        return
    try:
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6):
            pass
    except Exception as exc:
        logger.debug("Expo push dispatch skipped/failed: %s", exc)


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

    notif = Notification.objects.create(
        user=user,
        actor=actor,
        type=notif_type,
        text=clean_text,
        link=link[:255],
        question=question,
        answer=answer,
    )

    if not getattr(settings, "TESTING", False):
        try:
            tokens = list(PushToken.objects.filter(user=user).values_list("token", flat=True)[:5])
            if tokens:
                payload = {
                    "notification_id": notif.id,
                    "type": notif_type,
                    "link": link[:255],
                    "question_id": question.pk if question else None,
                }
                threading.Thread(
                    target=_dispatch_expo_push,
                    args=(tokens, "CampusNetwork", clean_text, payload),
                    daemon=True,
                ).start()
        except Exception:
            pass

    return notif
