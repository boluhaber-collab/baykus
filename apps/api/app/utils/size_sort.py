"""Logical beden order: XS S M L XL XXL 3XL… then numeric, then other labels."""

from __future__ import annotations

import re

_ALIASES = {
    "SMALL": "S",
    "MEDIUM": "M",
    "LARGE": "L",
    "XSMALL": "XS",
    "XXSMALL": "XXS",
    "XLARGE": "XL",
    "XXLARGE": "XXL",
    "XXXLARGE": "XXXL",
    "ONESIZE": "OS",
    "TEKBEDEN": "OS",
    "STANDART": "OS",
    "STANDARD": "OS",
    "STD": "OS",
}

_TABLE = {
    "XXXS": 0,
    "3XS": 0,
    "XXS": 10,
    "2XS": 10,
    "XS": 20,
    "S": 30,
    "M": 40,
    "L": 50,
    "XL": 60,
    "XXL": 70,
    "2XL": 70,
    "XXXL": 80,
    "3XL": 80,
    "XXXXL": 90,
    "4XL": 90,
    "5XL": 100,
    "6XL": 110,
    "7XL": 120,
    "8XL": 130,
    "OS": 200,
}

_NX = re.compile(r"^(\d+)X[LS]$")
_LEAD = re.compile(r"^(\d+(?:[.,]\d+)?)")


def _norm_token(token: str) -> str:
    t = re.sub(r"[\s._-]+", "", (token or "").strip().upper())
    return _ALIASES.get(t, t)


def _apparel_rank(token: str) -> int | None:
    key = _norm_token(token)
    if key in _TABLE:
        return _TABLE[key]
    m = _NX.match(key)
    if not m:
        return None
    n = int(m.group(1))
    if key.endswith("XL"):
        return 50 + n * 10
    if key.endswith("XS"):
        return 30 - n * 10
    return None


def size_sort_key(raw: str) -> tuple:
    t = re.sub(r"\s+", "", (raw or "").strip().upper())
    exact = _apparel_rank(t)
    if exact is not None:
        return (0, exact, 0, raw or "")
    if "/" in t:
        a, _, b = t.partition("/")
        ra, rb = _apparel_rank(a), _apparel_rank(b)
        if ra is not None and rb is not None:
            return (0, ra, rb, raw or "")
    m = _LEAD.match(t)
    if m:
        n = float(m.group(1).replace(",", "."))
        return (1, n, 0, raw or "")
    return (2, 0, 0, (raw or "").casefold())


def sort_sizes(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        t = (v or "").strip()
        if not t:
            continue
        key = t.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    out.sort(key=size_sort_key)
    return out
