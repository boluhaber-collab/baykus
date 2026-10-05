"""Sanitize BizimHesap sync markers from notes for display / PDF / exports.

DB keeps raw ``BH_IMPORT:…`` tags (idempotent re-import + delete guards).
Human-facing surfaces must never show GUID markers.
"""

from __future__ import annotations

import re
from typing import Any

from app.utils.html_text import decode_html_entities
from app.utils.dates import format_tr_dates_in_text

BH_IMPORT_PREFIX = "BH_IMPORT:"

# Bare sync tags: BH_IMPORT:… / BH_FROM_STOCK:… / BH:… / BHV:… (optionally with GUID)
_MARKER_ONLY_RE = re.compile(
    r"^(?:"
    r"BH_IMPORT(?::\S*)?"
    r"|BH_FROM_STOCK(?::\S*)?"
    r"|BHV:[A-Za-z0-9:_\-]+"
    r"|BH:[A-Za-z0-9:_\-]+"
    r")$",
    re.IGNORECASE,
)
_HEX_GUID_RE = re.compile(r"^[A-Fa-f0-9]{16,}$")
# Trailing / embedded BH_IMPORT:GUID tokens to strip from otherwise-human text
_STRIP_TOKEN_RE = re.compile(
    r"\b(?:BH_IMPORT|BH_FROM_STOCK|BHV?):\S+",
    re.IGNORECASE,
)


def is_bh_marker_only(text: str | None) -> bool:
    """True when *text* is empty or only a BH sync marker / hex GUID."""
    t = (text or "").strip()
    if not t:
        return True
    if "|" in t:
        return False
    if _MARKER_ONLY_RE.match(t):
        return True
    if _HEX_GUID_RE.match(t):
        return True
    return False


def _looks_like_bh_payload(raw: str) -> bool:
    upper = raw.upper()
    return (
        upper.startswith("BH_IMPORT:")
        or upper.startswith("BH_FROM_STOCK:")
        or "HAREKET=" in upper
        or _MARKER_ONLY_RE.match(raw) is not None
    )


def parse_bh_note(note: Any) -> dict[str, Any]:
    """Parse BH pipe notes; return parts + display_note (may still be None)."""
    raw = decode_html_entities(note).strip()
    if not raw:
        return {"is_bh": False, "display_note": None, "aciklama": None, "hareket": None}

    if not _looks_like_bh_payload(raw):
        return {
            "is_bh": False,
            "display_note": raw,
            "aciklama": raw,
            "hareket": None,
        }

    if is_bh_marker_only(raw):
        return {"is_bh": True, "display_note": None, "aciklama": None, "hareket": None}

    parts = [p.strip() for p in raw.split("|") if p.strip()]
    hareket = belge = odeme = cari = kullanici = None
    kalem_raw = bh_bakiye = kaynak = None
    free: list[str] = []

    for p in parts:
        pu = p.upper()
        if pu.startswith("BH_IMPORT:") or pu.startswith("BH_FROM_STOCK:"):
            continue
        if _MARKER_ONLY_RE.match(p) or _HEX_GUID_RE.match(p):
            continue
        eq = p.find("=")
        if 0 < eq < 24:
            key = p[:eq].strip().lower()
            val = p[eq + 1 :].strip()
            if key == "hareket":
                hareket = val
                continue
            if key == "belge":
                belge = val
                continue
            if key in ("odeme", "ödeme"):
                odeme = val
                continue
            if key in ("cari", "hesap"):
                cari = val
                continue
            if key in ("kullanici", "kullanıcı", "user"):
                kullanici = val
                continue
            if key == "kalem":
                kalem_raw = val
                continue
            if key == "bh_bakiye":
                bh_bakiye = val
                continue
            if key in ("kaynak", "source"):
                kaynak = val
                continue
            # Unknown key=value metadata — skip
            continue
        free.append(p)

    if cari:
        free = [f for f in free if f != cari and f.lower() != cari.lower()]

    # Drop free fragments that are themselves markers / GUIDs
    free = [f for f in free if not is_bh_marker_only(f)]
    aciklama = " · ".join(free).strip() or None
    if aciklama:
        aciklama = _STRIP_TOKEN_RE.sub("", aciklama).strip(" ·") or None

    display_bits: list[str] = []
    if belge:
        display_bits.append(f"Belge {belge}")
    if odeme:
        display_bits.append(odeme)
    if aciklama:
        display_bits.append(aciklama)
    if not display_bits and hareket:
        display_bits.append(hareket)

    return {
        "is_bh": True,
        "hareket": hareket,
        "belge": belge,
        "odeme": odeme,
        "cari": cari,
        "kullanici": kullanici,
        "aciklama": aciklama,
        "kalem_raw": kalem_raw,
        "bh_bakiye": bh_bakiye,
        "kaynak": kaynak,
        "display_note": " · ".join(display_bits) if display_bits else None,
    }


def sanitize_display_note(note: Any, fallback: str = "") -> str:
    """Human-facing note: strip BH_IMPORT / BH: / BHV: markers; keep real text.

    If the note is only a sync marker (or empty after stripping), return *fallback*
    (default empty — callers may pass a movement-type label).
    ISO dates inside free text are shown as dd.mm.yyyy.
    """
    raw = decode_html_entities(note).strip()
    if not raw:
        return format_tr_dates_in_text(fallback) if fallback else fallback

    if is_bh_marker_only(raw):
        return format_tr_dates_in_text(fallback) if fallback else fallback

    parsed = parse_bh_note(raw)
    if parsed.get("aciklama") and not is_bh_marker_only(parsed["aciklama"]):
        return format_tr_dates_in_text(str(parsed["aciklama"]))
    display = parsed.get("display_note")
    if display and not is_bh_marker_only(display):
        return format_tr_dates_in_text(str(display))
    if not parsed.get("is_bh") and raw and not is_bh_marker_only(raw):
        cleaned = _STRIP_TOKEN_RE.sub("", raw).strip(" ·|-")
        if cleaned and not is_bh_marker_only(cleaned):
            return format_tr_dates_in_text(cleaned)
    return format_tr_dates_in_text(fallback) if fallback else fallback


def sanitize_aciklama(note: Any, fallback: str = "") -> str:
    """Açıklama column: free-text only (no Belge/Ödeme/Hareket metadata)."""
    parsed = parse_bh_note(note)
    acik = parsed.get("aciklama")
    if acik and not is_bh_marker_only(acik):
        return format_tr_dates_in_text(str(acik))
    if not parsed.get("is_bh"):
        return sanitize_display_note(note, fallback=fallback)
    return format_tr_dates_in_text(fallback) if fallback else fallback


def extract_bh_meta_segments(note: Any) -> list[str]:
    """Keep BH sync / import metadata segments; drop free-text and Hareket= payload fields."""
    raw = decode_html_entities(note).strip()
    if not raw:
        return []
    if is_bh_marker_only(raw):
        return [raw]
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    meta: list[str] = []
    for p in parts:
        pu = p.upper()
        if pu.startswith("BH_IMPORT:") or pu.startswith("BH_FROM_STOCK:"):
            meta.append(p)
            continue
        if _MARKER_ONLY_RE.match(p) or _HEX_GUID_RE.match(p):
            meta.append(p)
            continue
        eq = p.find("=")
        if 0 < eq < 24:
            key = p[:eq].strip().lower()
            # Account-level import metadata (GUID / live balance) — preserve
            if key in ("bh guid", "bh_guid", "guid", "live_bal", "live_balance", "kaynak", "source"):
                meta.append(p)
                continue
            if key.replace(" ", "") in ("bhguid",):
                meta.append(p)
                continue
            # Movement payload keys — not account notes meta
            continue
        # free text — not meta
    return meta


def merge_bh_preserved_note(existing: Any, incoming: Any) -> str | None:
    """Merge user-edited human note with existing BH_IMPORT metadata (never drop sync tags).

    DB keeps ``BH_IMPORT:…`` for idempotent re-import. UI sends sanitized human text only.
    """
    meta = extract_bh_meta_segments(existing)
    human = sanitize_display_note(incoming, fallback="").strip()
    # If incoming still contains BH tokens (raw paste), prefer sanitize of incoming for human
    # and also pull any new meta from incoming
    incoming_meta = extract_bh_meta_segments(incoming)
    if incoming_meta and not meta:
        meta = incoming_meta
    elif incoming_meta:
        # Prefer existing meta order; ignore duplicate incoming meta
        pass
    if meta and human:
        return " | ".join(meta + [human])
    if meta:
        return " | ".join(meta)
    return human or None
