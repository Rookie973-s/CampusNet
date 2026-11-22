"""Helpers shared by the test suites: real image/video/PDF bytes and isolated storage."""
import io
import shutil
import struct
import tempfile

from django.test import override_settings
from PIL import Image


def png_bytes(w=8, h=8, fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (30, 80, 200)).save(buf, fmt)
    return buf.getvalue()


def _box(btype, payload):
    return struct.pack(">I4s", 8 + len(payload), btype) + payload


def mp4_bytes(seconds=60, timescale=1000, brand=b"isom", version=0):
    """A minimal structurally-valid MP4: ftyp + moov(mvhd) + mdat. Players wouldn't play it,
    but the container parsing (what the server validates) is real."""
    ftyp = _box(b"ftyp", brand + struct.pack(">I", 0) + brand)
    if version == 1:
        mvhd_body = b"\x01\x00\x00\x00" + struct.pack(">QQIQ", 0, 0, timescale, int(seconds * timescale))
    else:
        mvhd_body = b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, timescale, int(seconds * timescale))
    mvhd_body += b"\x00" * 80
    moov = _box(b"moov", _box(b"mvhd", mvhd_body))
    mdat = _box(b"mdat", b"\x00" * 64)
    return ftyp + moov + mdat


MIN_PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
           b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
           b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
           b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n"
           b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n164\n%%EOF\n")


class IsolatedStorage:
    """Mixin: each test class writes media and PDFs into throw-away temp folders."""

    @classmethod
    def setUpClass(cls):
        cls._media = tempfile.mkdtemp(prefix="cc_media_")
        cls._private = tempfile.mkdtemp(prefix="cc_private_")
        cls._ov = override_settings(MEDIA_ROOT=cls._media, LIBRARY_PRIVATE_ROOT=cls._private)
        cls._ov.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._ov.disable()
        shutil.rmtree(cls._media, ignore_errors=True)
        shutil.rmtree(cls._private, ignore_errors=True)
