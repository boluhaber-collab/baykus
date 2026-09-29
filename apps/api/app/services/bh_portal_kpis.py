"""BizimHesap newportal KPI cards — Ana Sayfa ciro / masraf / kasa / banka.

Scrapes https://uygulama.bizimhesap.com/web/ngn/newportal after panel login.
Credentials from env or /home/box/agent-data/box-secrets.json (never logged).
Results cached on disk + memory so the dashboard stays fast.
"""

from __future__ import annotations

import html as htmlmod
import http.cookiejar
import json
import logging
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
BASE = "https://uygulama.bizimhesap.com"

# Accounts present in older imports but no longer on live Hesaplarım /
# excluded from BH portal "Banka" widget total.
OOS_BANK_ACCOUNT_NAMES = frozenset(
    {
        "FON HESABI",
        "Banka TL Hesabı",
        "Banka EUR Hesabı",
    }
)
OOS_BANK_GUIDS = frozenset(
    {
        "448F8BAF831543EB87933633E78CB8AB",  # FON
        "A2A118922B464BA496BE68A7FBE3DC83",  # Banka TL
        "30ADEB0989BF405080D8B551EAA08364",  # Banka EUR
    }
)

# Default cache next to baykus.db (apps/api/data/)
def _default_cache_path() -> Path:
    # app/services/bh_portal_kpis.py → apps/api/
    api_root = Path(__file__).resolve().parents[2]
    return api_root / "data" / "bh_dashboard_kpis.json"


_lock = Lock()
_mem: dict[str, Any] | None = None
_mem_loaded_at: datetime | None = None
DEFAULT_TTL_SECONDS = 3600


def money(val: Any) -> float:
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float, Decimal)):
        return float(Decimal(str(val)).quantize(Decimal("0.01")))
    s = htmlmod.unescape(str(val)).strip().replace("TL", "").replace("\xa0", "").strip()
    if not s or s == "-":
        return 0.0
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        v = float(Decimal(s).quantize(Decimal("0.01")))
        return -v if neg else v
    except (InvalidOperation, ValueError):
        return 0.0


def load_secrets_card() -> dict:
    if not BOX_SECRETS.is_file():
        return {}
    try:
        data = json.loads(BOX_SECRETS.read_text(encoding="utf-8"))
    except Exception:
        return {}
    card = data.get("card") if isinstance(data, dict) else {}
    return card if isinstance(card, dict) else {}


def _creds() -> tuple[str, str]:
    card = load_secrets_card()
    user = (os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER") or "").strip()
    password = (
        os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD") or ""
    ).strip()
    return user, password


def _req(opener, url: str, data: dict | None = None):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "tr-TR,tr;q=0.9"}
    body = None
    if data is not None:
        body = urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    r = urllib.request.Request(url, data=body, headers=h)
    try:
        with opener.open(r, timeout=90) as resp:
            return resp.status, resp.geturl(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, getattr(e, "url", url), e.read()


def _grab(name: str, src: str) -> str:
    m = re.search(rf'name="{name}"[^>]*value="([^"]*)"', src) or re.search(
        rf'id="{name}"[^>]*value="([^"]*)"', src
    )
    return m.group(1) if m else ""


def parse_portal_html(html: str) -> dict[str, Any]:
    """Extract Ana Sayfa KPI cards from newportal HTML."""
    values: dict[str, str] = {}
    for m in re.finditer(r'id="(lbl[^"]+)"\s+class="value">([^<]*)</div>', html):
        values[m.group(1)] = m.group(2).strip()
    titles: dict[str, str] = {}
    for m in re.finditer(r'id="(lbl[^"]+)"\s+class="title">([^<]*)</div>', html):
        titles[m.group(1)] = htmlmod.unescape(m.group(2).strip())

    revenue_month = money(values.get("lblRevenueMonth", 0))
    cost_month = money(values.get("lblCostMonth", 0))
    revenue_30 = money(values.get("lblRevenue30", 0))
    cost_30 = money(values.get("lblCost30", 0))

    month_title = titles.get("lblRevenueMonthTitle") or ""
    # "Eylül Cirosu" → Eylül
    month_label = month_title.replace(" Cirosu", "").replace("Cirosu", "").strip() or None

    cash = None
    bank = None
    for m in re.finditer(
        r">(Kasa|Banka)</[^>]+>\s*<[^>]+>\s*(-?[\d.]+,\d{2})\s*TL",
        html,
    ):
        if m.group(1) == "Kasa":
            cash = money(m.group(2))
        elif m.group(1) == "Banka":
            bank = money(m.group(2))
    if cash is None or bank is None:
        for m in re.finditer(
            r"(Kasa|Banka).{0,160}?(-?[\d.]+,\d{2})\s*TL",
            html,
            re.S,
        ):
            if m.group(1) == "Kasa" and cash is None:
                cash = money(m.group(2))
            elif m.group(1) == "Banka" and bank is None:
                bank = money(m.group(2))

    now = datetime.now()
    return {
        "scraped_at": now.isoformat(timespec="seconds"),
        "source": "BH newportal KPI cards",
        "month_label": month_label,
        "month_year": now.year,
        "month_month": now.month,
        "orders_month_revenue": revenue_month,
        "month_expenses": cost_month,
        "month_net_profit": round(revenue_month - cost_month, 2),
        "revenue_30d": revenue_30,
        "expenses_30d": cost_30,
        "cash_balance": cash,
        "bank_balance": bank,
        "titles": titles,
        "raw_values": {k: values[k] for k in values},
    }


def scrape_live() -> dict[str, Any]:
    user, password = _creds()
    if not user or not password:
        raise RuntimeError("BIZIMHESAP_USER / BIZIMHESAP_PASSWORD missing")

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    st, _, raw = _req(opener, f"{BASE}/bhlogin")
    text = raw.decode("utf-8", "ignore")
    payload = {
        "__EVENTTARGET": "btnLogin",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": _grab("__VIEWSTATE", text),
        "__VIEWSTATEGENERATOR": _grab("__VIEWSTATEGENERATOR", text),
        "txtEmail": user,
        "txtPassword": password,
        "reCAPTCHAToken": "",
    }
    st, final, raw = _req(opener, f"{BASE}/bhlogin", data=payload)
    if "newportal" not in final and "ngn" not in final:
        raise RuntimeError(f"BH login failed (landed on {final})")

    st, _, raw = _req(opener, f"{BASE}/web/ngn/newportal")
    html = raw.decode("utf-8", "ignore")
    data = parse_portal_html(html)
    if data.get("orders_month_revenue") is None and data.get("cash_balance") is None:
        raise RuntimeError("BH portal KPI parse returned empty")
    return data


def save_cache(data: dict[str, Any], path: Path | None = None) -> Path:
    path = path or _default_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_cache(path: Path | None = None) -> dict[str, Any] | None:
    path = path or _default_cache_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _cache_age_seconds(data: dict[str, Any]) -> float | None:
    raw = data.get("scraped_at")
    if not raw:
        return None
    try:
        scraped = datetime.fromisoformat(str(raw))
        return max(0.0, (datetime.now() - scraped).total_seconds())
    except Exception:
        return None


def get_bh_dashboard_kpis(
    *,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    force_refresh: bool = False,
    allow_network: bool = True,
) -> dict[str, Any] | None:
    """Return BH portal KPIs (memory → fresh disk → live scrape)."""
    global _mem, _mem_loaded_at

    with _lock:
        if (
            not force_refresh
            and _mem is not None
            and _mem_loaded_at is not None
            and (datetime.now() - _mem_loaded_at).total_seconds() < ttl_seconds
        ):
            return _mem

        cached = load_cache()
        age = _cache_age_seconds(cached) if cached else None
        if (
            not force_refresh
            and cached
            and age is not None
            and age < ttl_seconds
            and cached.get("orders_month_revenue") is not None
        ):
            _mem = cached
            _mem_loaded_at = datetime.now()
            return cached

        if not allow_network:
            if cached:
                _mem = cached
                _mem_loaded_at = datetime.now()
            return cached

        try:
            data = scrape_live()
            save_cache(data)
            _mem = data
            _mem_loaded_at = datetime.now()
            return data
        except Exception as exc:
            logger.warning("BH portal KPI scrape failed: %s", exc)
            if cached:
                _mem = cached
                _mem_loaded_at = datetime.now()
                return cached
            return None


def is_oos_bank_account(name: str | None, notes: str | None = None) -> bool:
    n = (name or "").strip()
    if n in OOS_BANK_ACCOUNT_NAMES:
        return True
    blob = f"{notes or ''} {n}"
    return any(g in blob for g in OOS_BANK_GUIDS)
