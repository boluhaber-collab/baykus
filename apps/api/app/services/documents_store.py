"""Store general cabinet uploads under apps/api/uploads/documents/."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

UPLOADS_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "documents"


def ensure_uploads_dir() -> Path:
    UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOADS_ROOT


def safe_original_name(name: str) -> str:
    base = Path(name or "dosya").name
    base = re.sub(r"[^\w.\-ığüşöçİĞÜŞÖÇ\s]", "_", base, flags=re.IGNORECASE)
    return (base or "dosya")[:200]


def make_stored_name(original: str) -> str:
    ext = Path(original).suffix[:20]
    return f"{uuid.uuid4().hex}{ext}"


def absolute_path(stored_filename: str) -> Path:
    return ensure_uploads_dir() / stored_filename
