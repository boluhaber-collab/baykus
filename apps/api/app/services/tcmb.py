"""Fetch USD/TRY from TCMB (fail soft, short in-memory cache)."""

from __future__ import annotations

import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"
_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_TTL_SEC = 3600


def get_usd_rate(force: bool = False) -> dict[str, Any]:
    """Return {ok, buy, sell, mid, source, as_of, error?} — never raises."""
    now = time.time()
    if not force and _CACHE["data"] and (now - float(_CACHE["ts"])) < _TTL_SEC:
        return dict(_CACHE["data"])

    try:
        req = urllib.request.Request(
            TCMB_URL,
            headers={"User-Agent": "BaykusBaskiWeb/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read()
        root = ET.fromstring(raw)
        usd = None
        for cur in root.findall("Currency"):
            if cur.get("CurrencyCode") == "USD":
                usd = cur
                break
        if usd is None:
            raise ValueError("USD not in TCMB feed")

        def _f(tag: str) -> float | None:
            el = usd.find(tag)
            if el is None or el.text is None:
                return None
            return float(el.text.replace(",", "."))

        buy = _f("ForexBuying")
        sell = _f("ForexSelling")
        if buy is None and sell is None:
            raise ValueError("empty rates")
        mid = None
        if buy is not None and sell is not None:
            mid = round((buy + sell) / 2, 4)
        elif buy is not None:
            mid = buy
        else:
            mid = sell

        data = {
            "ok": True,
            "buy": buy,
            "sell": sell,
            "mid": mid,
            "source": "TCMB",
            "as_of": root.get("Date") or root.get("Tarih"),
            "error": None,
        }
        _CACHE["ts"] = now
        _CACHE["data"] = data
        return dict(data)
    except Exception as exc:  # noqa: BLE001 — fail soft
        soft = {
            "ok": False,
            "buy": None,
            "sell": None,
            "mid": None,
            "source": "TCMB",
            "as_of": None,
            "error": str(exc)[:200],
        }
        # Keep last good cache if present
        if _CACHE["data"] and _CACHE["data"].get("ok"):
            stale = dict(_CACHE["data"])
            stale["error"] = soft["error"]
            stale["stale"] = True
            return stale
        return soft
