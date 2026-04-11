"""
app/routes/media.py

Flask blueprint for media upload.

POST /api/media/upload
  - Accepts multipart/form-data with field "file".
  - Validates MIME type server-side (not just extension).
  - Enforces 10 MB size limit (via Flask MAX_CONTENT_LENGTH).
  - Processes image (resize, strip EXIF) via image_processor.
  - Saves original + thumbnail via storage backend.
  - Returns { url, thumbnailUrl }.

This route is called directly from the frontend (not proxied through Node.js)
because it is not a sensitive authenticated flow — the resulting URL is then
POSTed to Node.js /api/profile/photos by the client.
"""

from __future__ import annotations

import os
from flask import Blueprint, request, jsonify, current_app

from app.services.image_processor import process_image, ALLOWED_MIME_TYPES
from app.services.storage import save_file

media_bp = Blueprint("media", __name__, url_prefix="/api/media")

INTERNAL_SECRET_HEADER = "X-Internal-Secret"


def _verify_secret() -> bool:
    """Optionally verify the internal API secret if configured."""
    secret = current_app.config.get("INTERNAL_API_SECRET", "")
    if not secret:
        return True  # Not configured — allow all (dev mode)
    return request.headers.get(INTERNAL_SECRET_HEADER, "") == secret


@media_bp.post("/upload")
def upload_image():
    """
    Upload and process a profile image.
    Returns: { success: true, data: { url, thumbnailUrl } }
    """
    if not _verify_secret():
        return jsonify({"success": False, "error": "Forbidden"}), 403

    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file provided (field name: 'file')"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "Empty filename"}), 400

    # Read bytes
    file_bytes = file.read()

    # Server-side MIME type validation (not just extension)
    mime_type = file.mimetype or ""
    if mime_type not in ALLOWED_MIME_TYPES:
        return jsonify({
            "success": False,
            "error": f"Invalid file type '{mime_type}'. Allowed: jpeg, png, webp",
        }), 400

    # Process (resize + strip EXIF)
    try:
        processed = process_image(file_bytes, mime_type)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.error("Image processing error: %s", exc)
        return jsonify({"success": False, "error": "Image processing failed"}), 500

    # Persist both sizes
    try:
        url = save_file(processed["original"], prefix="orig")
        thumbnail_url = save_file(processed["thumbnail"], prefix="thumb")
    except Exception as exc:
        current_app.logger.error("Storage error: %s", exc)
        return jsonify({"success": False, "error": "Failed to save image"}), 500

    return jsonify({
        "success": True,
        "data": {"url": url, "thumbnailUrl": thumbnail_url},
    }), 201
