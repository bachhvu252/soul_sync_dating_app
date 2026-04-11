"""
app/services/storage.py

Abstract storage backend for saving and deleting processed images.

Local dev:  STORAGE_BACKEND=local — saves files to ./uploads/
Production: STORAGE_BACKEND=s3   — uploads to AWS S3
            STORAGE_BACKEND=cloudinary — uploads via Cloudinary SDK

The active backend is selected at import time from the STORAGE_BACKEND env var.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path


STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
UPLOADS_DIR = os.path.abspath(os.getenv("UPLOADS_DIR", "./uploads"))


# ── Local Storage ─────────────────────────────────────────────────────────────

def _save_local(file_bytes: bytes, filename: str) -> str:
    """Save bytes to the local uploads directory. Returns a URL path."""
    dest = Path(UPLOADS_DIR) / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_bytes)
    # URL served by Node.js static middleware at /uploads/<filename>
    return f"/uploads/{filename}"


def _delete_local(url: str) -> None:
    filename = url.lstrip("/uploads/")
    dest = Path(UPLOADS_DIR) / filename
    if dest.exists():
        dest.unlink()


# ── S3 Storage ────────────────────────────────────────────────────────────────

def _save_s3(file_bytes: bytes, filename: str) -> str:
    import boto3
    bucket = os.getenv("AWS_S3_BUCKET")
    region = os.getenv("AWS_REGION", "us-east-1")
    s3 = boto3.client("s3", region_name=region)
    s3.put_object(Bucket=bucket, Key=filename, Body=file_bytes, ContentType="image/jpeg")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{filename}"


# ── Cloudinary Storage ────────────────────────────────────────────────────────

def _save_cloudinary(file_bytes: bytes, filename: str) -> str:
    import cloudinary
    import cloudinary.uploader
    import io
    result = cloudinary.uploader.upload(
        io.BytesIO(file_bytes),
        public_id=filename.rsplit(".", 1)[0],
        format="jpg",
    )
    return result["secure_url"]


# ── Public API ────────────────────────────────────────────────────────────────

def save_file(file_bytes: bytes, prefix: str = "img") -> str:
    """
    Save file bytes to the configured storage backend.
    Returns the public URL.
    """
    filename = f"{prefix}_{uuid.uuid4().hex}.jpg"

    if STORAGE_BACKEND == "s3":
        return _save_s3(file_bytes, filename)
    elif STORAGE_BACKEND == "cloudinary":
        return _save_cloudinary(file_bytes, filename)
    else:
        return _save_local(file_bytes, filename)


def delete_file(url: str) -> None:
    """Delete a file from storage by its URL (best-effort)."""
    if STORAGE_BACKEND == "local":
        _delete_local(url)
    # TODO: implement S3/Cloudinary deletion
