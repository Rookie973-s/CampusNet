"""Shared security utilities: image re-encoding (EXIF strip), safe HTML sanitization,
client IP hashing, and platform email dispatch (with optional FormSubmit support)."""

import hashlib
import io
import json
import logging
import re
import urllib.request
import uuid
from html.parser import HTMLParser

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

# Allowed image formats & magic bytes
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


def hash_ip(request) -> str:
    """One-way salted hash of the client IP for deduplication without storing raw PII."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "unknown")
    salt = getattr(settings, "SECRET_KEY", "cenet")[:16]
    return hashlib.sha256(f"{salt}:{ip}".encode("utf-8")).hexdigest()[:32]


def is_probable_bot(request) -> bool:
    ua = (request.META.get("HTTP_USER_AGENT") or "").lower()
    if not ua:
        return False
    bot_markers = ("bot", "crawler", "spider", "curl/", "wget/", "python-requests", "scrapy", "headless")
    return any(m in ua for m in bot_markers)


def validate_and_reencode_image(uploaded_file, max_bytes=MAX_AVATAR_BYTES, max_dim=1600):
    """Validate uploaded image via Pillow and re-encode to strip EXIF/metadata & active payloads.

    Returns a Django ContentFile with a UUID filename.
    """
    from PIL import Image, ImageOps

    size = getattr(uploaded_file, "size", 0) or 0
    if size == 0:
        raise ValidationError("Uploaded image is empty.")
    if size > max_bytes:
        raise ValidationError(f"Image is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.")

    uploaded_file.seek(0)
    raw = uploaded_file.read()
    try:
        img = Image.open(io.BytesIO(raw))
        fmt = (img.format or "").upper()
        if fmt not in ALLOWED_IMAGE_FORMATS:
            raise ValidationError("Only JPEG, PNG, WebP, or GIF images are allowed.")
        img.verify()
        # Re-open after verify() to process and re-encode
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
    except ValidationError:
        raise
    except Exception:
        raise ValidationError("Invalid or corrupted image file.")

    # Resize down if huge
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim))

    out = io.BytesIO()
    if fmt == "GIF":
        ext = "gif"
        img.save(out, format="GIF")
    elif fmt == "PNG" or img.mode in ("RGBA", "LA", "P"):
        ext = "png"
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")
        img.save(out, format="PNG", optimize=True)
    else:
        ext = "jpg"
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=86, optimize=True)

    out.seek(0)
    filename = f"{uuid.uuid4().hex}.{ext}"
    return ContentFile(out.read(), name=filename)


# ── Safe HTML sanitizer (strict allowlist, strips all attributes & scripts) ──

_ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "br", "p"}
_VOID_TAGS = {"br"}
_DROP_CONTENT_TAGS = {"script", "style", "iframe", "object", "embed", "svg"}


class _SafeHTMLSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.stack = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in _DROP_CONTENT_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth > 0:
            return
        if tag in _ALLOWED_TAGS:
            self.parts.append(f"<{tag}>")
            if tag not in _VOID_TAGS:
                self.stack.append(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in _DROP_CONTENT_TAGS:
            if self.skip_depth > 0:
                self.skip_depth -= 1
            return
        if self.skip_depth > 0:
            return
        if tag in _ALLOWED_TAGS and tag not in _VOID_TAGS and tag in self.stack:
            while self.stack:
                top = self.stack.pop()
                self.parts.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data):
        if self.skip_depth > 0:
            return
        escaped = (
            data.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        self.parts.append(escaped)

    def get_html(self):
        while self.stack:
            self.parts.append(f"</{self.stack.pop()}>")
        return "".join(self.parts).strip()


def sanitize_rich_html(raw_html: str) -> str:
    """Strictly allow only basic inline formatting tags (b, strong, i, em, u, br, p) with zero attributes."""
    if not raw_html:
        return ""
    parser = _SafeHTMLSanitizer()
    parser.feed(str(raw_html))
    parser.close()
    return parser.get_html()


def strip_html_to_text(raw_html: str) -> str:
    if not raw_html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", str(raw_html), flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def _parse_sender(from_email: str):
    """Split 'CampusNetwork <user@example.com>' into (name, email)."""
    raw = (from_email or "").strip()
    m = re.match(r"^(.*?)\s*<([^>]+)>$", raw)
    if m:
        return (m.group(1).strip().strip('"') or "CampusNetwork", m.group(2).strip())
    return ("CampusNetwork", raw or "no-reply@campusnetwork.edu.ng")


def send_platform_email(
    recipient_email: str,
    subject: str,
    message: str,
    *,
    allow_formsubmit: bool = True,
) -> bool:
    """Send an email via HTTPS API (Brevo or Resend, ideal for Render Free Tier)
    or Django's configured EMAIL_BACKEND (SMTP/console), and optionally also notify
    via FormSubmit for non-secret administrative/workflow emails (e.g. SUG approvals).

    NEVER set allow_formsubmit=True for password reset codes or verification tokens!
    """
    sent = False
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "CampusNetwork <no-reply@campusnetwork.edu.ng>")
    sender_name, sender_addr = _parse_sender(from_email)

    brevo_key = (getattr(settings, "BREVO_API_KEY", "") or "").strip()
    resend_key = (getattr(settings, "RESEND_API_KEY", "") or "").strip()

    if brevo_key and recipient_email:
        try:
            payload = json.dumps({
                "sender": {"name": sender_name, "email": sender_addr},
                "to": [{"email": recipient_email}],
                "subject": subject,
                "textContent": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=payload,
                headers={
                    "api-key": brevo_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    sent = True
        except Exception as exc:
            logger.warning("Brevo email delivery failed for %s: %s", recipient_email, exc)

    if not sent and resend_key and recipient_email:
        try:
            payload = json.dumps({
                "from": from_email,
                "to": [recipient_email],
                "subject": subject,
                "text": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    sent = True
        except Exception as exc:
            logger.warning("Resend email delivery failed for %s: %s", recipient_email, exc)

    if not sent:
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[recipient_email],
                fail_silently=False,
            )
            sent = True
        except Exception as exc:
            logger.warning("Django email delivery failed for %s: %s", recipient_email, exc)

    formsubmit_enabled = getattr(settings, "FORMSUBMIT_ENABLED", False)
    if allow_formsubmit and formsubmit_enabled and recipient_email:
        try:
            endpoint = getattr(settings, "FORMSUBMIT_ENDPOINT", "https://formsubmit.co/ajax")
            url = f"{endpoint.rstrip('/')}/{recipient_email}"
            payload = json.dumps({
                "_subject": subject,
                "message": message,
                "_captcha": "false",
                "_template": "box",
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "CampusNetwork-Cenet/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if 200 <= resp.status < 300:
                    sent = True
        except Exception as exc:
            logger.warning("FormSubmit delivery failed for %s: %s", recipient_email, exc)

    return sent
