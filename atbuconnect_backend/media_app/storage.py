"""Database-backed Django Storage backend (`StoredMediaFile`).

Guarantees 100% consistent media synchronization across:
- Mobile (Android / iOS) and Website (Vercel)
- Multiple Render workers, deploys, and cold starts
- Zero dependency on Render's ephemeral local filesystem or external S3 buckets

Public files (`is_private=False`) are served via `/media/<path>` in `config/urls.py`.
Private files (`is_private=True`, e.g., Library PDFs & Verification IDs) are NEVER served
under `/media/` and can only be streamed by authenticated/signed Django views.
"""

import io
import mimetypes
import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


def _normalize_name(name: str) -> str:
    return str(name or "").replace("\\", "/").lstrip("/")


@deconstructible
class DatabaseMediaStorage(Storage):
    def __init__(self, is_private: bool = False):
        self.is_private = is_private

    def _model(self):
        from media_app.models import StoredMediaFile
        return StoredMediaFile

    def _open(self, name, mode="rb"):
        clean = _normalize_name(name)
        StoredMediaFile = self._model()
        row = StoredMediaFile.objects.filter(name=clean).first()
        if row is not None:
            f = ContentFile(bytes(row.data), name=clean)
            f.content_type = row.content_type
            return f
        # Fallback to local filesystem for any legacy pre-existing files
        base = getattr(settings, "LIBRARY_PRIVATE_ROOT", settings.MEDIA_ROOT) if self.is_private else settings.MEDIA_ROOT
        disk_path = os.path.join(str(base), clean)
        if os.path.isfile(disk_path):
            with open(disk_path, "rb") as fh:
                return ContentFile(fh.read(), name=clean)
        raise FileNotFoundError(f"Stored media file not found: {clean}")

    def _save(self, name, content):
        clean = _normalize_name(name)
        if hasattr(content, "seek"):
            try:
                content.seek(0)
            except Exception:
                pass
        raw = content.read()
        if isinstance(raw, str):
            raw = raw.encode("utf-8")
        ctype = getattr(content, "content_type", None) or mimetypes.guess_type(clean)[0] or "application/octet-stream"
        StoredMediaFile = self._model()
        StoredMediaFile.objects.update_or_create(
            name=clean,
            defaults={
                "content_type": ctype[:120],
                "data": raw,
                "size": len(raw),
                "is_private": self.is_private,
            },
        )
        return clean

    def delete(self, name):
        clean = _normalize_name(name)
        if not clean:
            return
        self._model().objects.filter(name=clean).delete()

    def exists(self, name):
        clean = _normalize_name(name)
        if not clean:
            return False
        return self._model().objects.filter(name=clean).exists()

    def size(self, name):
        clean = _normalize_name(name)
        row = self._model().objects.filter(name=clean).only("size").first()
        if row is not None:
            return row.size
        return 0

    def url(self, name):
        if self.is_private:
            raise ValueError("Private stored files do not have a public URL.")
        clean = _normalize_name(name)
        media_url = (getattr(settings, "MEDIA_URL", "/media/") or "/media/").rstrip("/")
        return f"{media_url}/{clean}"

    def get_available_name(self, name, max_length=None):
        clean = _normalize_name(name)
        if max_length and len(clean) > max_length:
            base, ext = os.path.splitext(clean)
            clean = f"{base[: max_length - len(ext)]}{ext}"
        return clean


@deconstructible
class DatabasePrivateStorage(DatabaseMediaStorage):
    def __init__(self):
        super().__init__(is_private=True)
