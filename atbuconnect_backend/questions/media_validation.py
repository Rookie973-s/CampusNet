"""Server-side validation for post attachments (images and short videos).

Nothing is trusted from the client: not the filename, not the Content-Type.

* Images are opened and verified with Pillow (real decode, format whitelist,
  pixel-count cap against decompression bombs).
* Videos are parsed as ISO-BMFF (MP4 / MOV / M4V): the `ftyp` brand is checked and the
  duration is read from the `moov/mvhd` box. A renamed text/exe file, or an MP4 that
  claims to be short but isn't, is rejected. WebM/AVI/MKV are not accepted, because we
  have no dependency-free way to measure their duration reliably.
"""
import struct

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

MAX_IMAGES = 6
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
MAX_IMAGE_PIXELS = 50_000_000


def _limit(name, default):
    return getattr(settings, name, default)


def max_image_bytes():
    return int(_limit("POST_MAX_IMAGE_BYTES", 10 * 1024 * 1024))


def max_video_bytes():
    return int(_limit("POST_MAX_VIDEO_BYTES", 100 * 1024 * 1024))


def max_video_seconds():
    return int(_limit("POST_MAX_VIDEO_SECONDS", 5 * 60))


def validate_image(f):
    """Returns (width, height). Raises ValidationError."""
    size = getattr(f, "size", 0) or 0
    if size == 0:
        raise ValidationError("An attached image is empty.")
    if size > max_image_bytes():
        raise ValidationError(f"Images can be at most {max_image_bytes() // (1024 * 1024)} MB each.")
    f.seek(0)
    try:
        with Image.open(f) as im:
            fmt = (im.format or "").upper()
            if fmt not in ALLOWED_IMAGE_FORMATS:
                raise ValidationError("Images must be JPEG, PNG, WebP or GIF.")
            w, h = im.size
            if w * h > MAX_IMAGE_PIXELS:
                raise ValidationError("That image is too large (resolution).")
            im.verify()  # full structural check
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError("One of the attached files is not a valid image.")
    f.seek(0)
    return w, h


_CONTAINERS = {b"moov", b"trak", b"mdia", b"udta", b"edts"}
_BRANDS_OK = {
    b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"M4A ",
    b"qt  ", b"dash", b"mmp4", b"f4v ", b"3gp4", b"3gp5", b"3gp6",
}


def _read_boxes(f, start, end):
    """Yield (type, payload_start, payload_end) for the boxes in [start, end)."""
    pos = start
    while pos + 8 <= end:
        f.seek(pos)
        header = f.read(8)
        if len(header) < 8:
            return
        size, btype = struct.unpack(">I4s", header)
        hdr = 8
        if size == 1:  # 64-bit size
            ext = f.read(8)
            if len(ext) < 8:
                return
            size = struct.unpack(">Q", ext)[0]
            hdr = 16
        elif size == 0:  # box runs to the end of the file
            size = end - pos
        if size < hdr or pos + size > end:
            return
        yield btype, pos + hdr, pos + size
        pos += size


def video_duration_seconds(f, size):
    """Duration in seconds from moov/mvhd, or None if the file isn't a readable MP4/MOV."""
    f.seek(0)
    head = f.read(12)
    if len(head) < 12 or head[4:8] != b"ftyp":
        return None
    brand = head[8:12]
    if brand not in _BRANDS_OK:
        return None
    for btype, ps, pe in _read_boxes(f, 0, size):
        if btype != b"moov":
            continue
        for ctype, cps, cpe in _read_boxes(f, ps, pe):
            if ctype != b"mvhd":
                continue
            f.seek(cps)
            version = f.read(1)
            f.read(3)  # flags
            if version == b"\x01":
                data = f.read(28)  # created(8) modified(8) timescale(4) duration(8)
                if len(data) < 28:
                    return None
                timescale, duration = struct.unpack(">IQ", data[16:28])
            else:
                data = f.read(16)  # created(4) modified(4) timescale(4) duration(4)
                if len(data) < 16:
                    return None
                timescale, duration = struct.unpack(">II", data[8:16])
            if timescale <= 0:
                return None
            return duration / timescale
    return None


def validate_video(f):
    """Returns duration in seconds. Raises ValidationError."""
    size = getattr(f, "size", 0) or 0
    if size == 0:
        raise ValidationError("The attached video is empty.")
    if size > max_video_bytes():
        raise ValidationError(f"Videos can be at most {max_video_bytes() // (1024 * 1024)} MB.")
    duration = video_duration_seconds(f, size)
    f.seek(0)
    if duration is None:
        raise ValidationError("The video must be a valid MP4 or MOV file.")
    if duration <= 0:
        raise ValidationError("The video appears to be empty.")
    if duration > max_video_seconds():
        mins = max_video_seconds() // 60
        raise ValidationError(f"Videos can be at most {mins} minutes long.")
    return duration
