"""Server-side PDF validation. Frontend checks are a convenience only.

Relaxed security model:
- Hard-blocks genuinely invalid, empty, oversized, or corrupted/non-PDF files.
- NEVER rejects PDFs solely for obfuscated hex-escaped names or embedded content/scripts/actions;
  instead returns structured security warnings so the uploader and viewers see a clear caution
  while the server serves all PDFs strictly isolated (sandbox CSP, nosniff, private off-root storage).
"""
import re
from django.core.exceptions import ValidationError

from . import conf

_ACTIVE = re.compile(rb"/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b")
_HEX_ESCAPED_NAME = re.compile(rb"/[A-Za-z]*#[0-9A-Fa-f]{2}")


def sanitize_filename(name: str) -> str:
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    return name[:200] or "document.pdf"


def validate_pdf_upload(f):
    """Validates structural PDF integrity and returns a list of security warning strings.

    Raises ValidationError only for truly invalid, empty, oversized, or non-PDF uploads.
    """
    name = (getattr(f, "name", "") or "")
    if not name.lower().endswith(".pdf"):
        raise ValidationError("Only .pdf files are accepted.")

    limit = conf.MAX_PDF_BYTES()
    size = getattr(f, "size", 0) or 0
    if size == 0:
        raise ValidationError("The uploaded file is empty.")
    if size > limit:
        raise ValidationError(f"File is too large. Maximum size is {limit // (1024 * 1024)} MB.")

    f.seek(0)
    head = f.read(1024)
    if not head.startswith(b"%PDF-"):
        raise ValidationError("This file is not a valid PDF.")

    f.seek(max(size - 2048, 0))
    tail = f.read()
    if b"%%EOF" not in tail:
        raise ValidationError("This PDF looks truncated or corrupted.")

    f.seek(0)
    data = f.read()
    warnings = []

    active_matches = sorted({m.group(1).decode("ascii", "ignore") for m in _ACTIVE.finditer(data)})
    if active_matches:
        warnings.append(
            f"This PDF contains active or embedded elements ({', '.join(active_matches)}). "
            "Scripts and launch actions are sandboxed and disabled on CampusNetwork, but exercise caution if opening externally."
        )
    if _HEX_ESCAPED_NAME.search(data):
        warnings.append(
            "This PDF contains hex-escaped or obfuscated internal object names. "
            "It is served inside a sandboxed viewer for safety."
        )

    # Structural parse when pypdf is installed (optional dependency).
    try:
        import io
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError
    except Exception:  # pragma: no cover - optional
        PdfReader = None
    if PdfReader is not None:
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                warnings.append("This PDF is encrypted or password-protected and may not preview in all browsers.")
            elif len(reader.pages) == 0:
                raise ValidationError("This PDF has no pages.")
        except ValidationError:
            raise
        except PdfReadError:
            warnings.append("This PDF has non-standard internal structure; preview may vary across viewers.")
        except Exception:
            warnings.append("This PDF has non-standard internal structure; preview may vary across viewers.")
    f.seek(0)
    return warnings
