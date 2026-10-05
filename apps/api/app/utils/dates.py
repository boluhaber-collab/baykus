"""Turkish date display: GG.AA.YYYY (dd.mm.yyyy). Keep ISO for APIs/storage."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_ISO_IN_TEXT_RE = re.compile(
    r"\b(\d{4})-(\d{2})-(\d{2})"
    r"(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b"
)


def format_tr_date(value: Any, empty: str = "—") -> str:
    """date / datetime / ISO string → dd.mm.yyyy for human-facing surfaces."""
    if value is None or value == "":
        return empty
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")
    if isinstance(value, date):
        return value.strftime("%d.%m.%Y")
    s = str(value).strip()
    if not s:
        return empty
    if re.match(r"^\d{1,2}\.\d{1,2}\.\d{4}", s):
        m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})", s)
        if m:
            return f"{int(m.group(1)):02d}.{int(m.group(2)):02d}.{m.group(3)}"
        return s
    m = _ISO_DATE_RE.match(s)
    if m:
        return f"{m.group(3)}.{m.group(2)}.{m.group(1)}"
    return s


def format_tr_datetime(value: Any, empty: str = "—") -> str:
    """date / datetime / ISO → dd.mm.yyyy or dd.mm.yyyy HH:MM."""
    if value is None or value == "":
        return empty
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d.%m.%Y")
    s = str(value).strip()
    if not s:
        return empty
    date_part = format_tr_date(s[:10], "")
    if not date_part:
        return empty
    tm = re.search(r"[T\s](\d{2}):(\d{2})", s)
    if tm:
        return f"{date_part} {tm.group(1)}:{tm.group(2)}"
    return date_part


def format_tr_dates_in_text(text: Any) -> str:
    """Replace ISO dates/datetimes inside free text (Açıklama, period labels)."""
    if text is None:
        return ""
    s = str(text)
    if not s:
        return s

    def _repl(m: re.Match[str]) -> str:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        out = f"{d}.{mo}.{y}"
        tm = re.search(r"[T\s](\d{2}):(\d{2})", m.group(0))
        if tm:
            return f"{out} {tm.group(1)}:{tm.group(2)}"
        return out

    return _ISO_IN_TEXT_RE.sub(_repl, s)


def format_tr_period(
    from_date: date | None,
    to_date: date | None,
    *,
    all_label: str = "Tüm hareketler",
) -> str:
    if from_date and to_date:
        return f"{format_tr_date(from_date)} → {format_tr_date(to_date)}"
    if from_date:
        return f"{format_tr_date(from_date)} → …"
    if to_date:
        return f"… → {format_tr_date(to_date)}"
    return all_label
