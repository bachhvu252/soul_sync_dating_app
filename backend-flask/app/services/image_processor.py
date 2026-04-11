"""
app/services/image_processor.py

Image processing pipeline using Pillow.

Rules (from CLAUDE.md):
  - Max file size: 10 MB (enforced by Flask MAX_CONTENT_LENGTH).
  - Accepted MIME types: image/jpeg, image/png, image/webp.
  - Generate two sizes:
      original   — max 1080 px on longest axis (JPEG quality 85)
      thumbnail  — max 300 px on longest axis (JPEG quality 75)
  - Strip EXIF metadata by converting to RGB (privacy protection).
  - Return bytes for both sizes.
"""

from __future__ import annotations

import io
from PIL import Image


ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ORIGINAL_MAX_PX = 1080
THUMBNAIL_MAX_PX = 300
JPEG_QUALITY_ORIGINAL = 85
JPEG_QUALITY_THUMB = 75


def _resize_and_encode(img: Image.Image, max_px: int, quality: int) -> bytes:
    """Resize image to fit within max_px × max_px, encode as JPEG bytes."""
    resized = img.copy()
    resized.thumbnail((max_px, max_px), Image.LANCZOS)
    output = io.BytesIO()
    resized.save(output, format="JPEG", quality=quality, optimize=True)
    return output.getvalue()


def process_image(file_bytes: bytes, mime_type: str) -> dict:
    """
    Validate, strip EXIF, and produce original + thumbnail versions.

    Args:
        file_bytes : raw upload bytes
        mime_type  : MIME type string (must be in ALLOWED_MIME_TYPES)

    Returns:
        { "original": bytes, "thumbnail": bytes }

    Raises:
        ValueError if the file is not a supported image type.
    """
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Unsupported image type: {mime_type}. Allowed: {ALLOWED_MIME_TYPES}")

    img = Image.open(io.BytesIO(file_bytes))

    # Convert to RGB — this strips EXIF data and normalises colour spaces
    img = img.convert("RGB")

    original_bytes = _resize_and_encode(img, ORIGINAL_MAX_PX, JPEG_QUALITY_ORIGINAL)
    thumbnail_bytes = _resize_and_encode(img, THUMBNAIL_MAX_PX, JPEG_QUALITY_THUMB)

    return {"original": original_bytes, "thumbnail": thumbnail_bytes}
