"""Decode HTML numeric/named entities in BH-scraped text fields.

BizimHesap GetCashTrx (and some other endpoints) return Turkish characters as
HTML entities inside JSON strings, e.g. ``&#246;`` for ö, ``&#231;`` for ç.
Call ``decode_html_entities`` on every text field at ingest so SQLite never
stores entities. Safe to call repeatedly (idempotent for already-decoded text).
"""

from __future__ import annotations

import html
from typing import Any


def decode_html_entities(value: Any) -> str:
    """Return ``str(value)`` with HTML entities decoded; None/empty → \"\"."""
    if value is None:
        return ""
    s = str(value)
    if not s:
        return ""
    # Fast path: no entity marker
    if "&#" not in s and "&" not in s:
        return s
    # html.unescape handles &#NNN; &#xHH; and named entities (&amp; etc.)
    # Run twice in case of rare double-encoding (&#38;#246;).
    out = html.unescape(s)
    if "&#" in out or ("&" in out and ";" in out):
        out = html.unescape(out)
    return out


def decode_optional(value: Any) -> str | None:
    """Like decode_html_entities but empty → None."""
    s = decode_html_entities(value).strip()
    return s or None
