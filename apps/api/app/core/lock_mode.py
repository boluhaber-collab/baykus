"""Yetki / Kilit Modu — masaüstü yetki_kilit_modu API gate.

Kaynak: app_settings.user_mode (istemci Sidebar filterNavByLockMode ile aynı presetler).
Gizli modüller için ilgili API prefix'leri 403 döner (yalnızca menü gizlemek yetmez).
"""

from __future__ import annotations

from typing import Iterable

# Masaüstü yetki_menuleri — web LOCK_MODE_ALLOWED ile birebir.
LOCK_MODE_ALLOWED_GROUPS: dict[str, list[str]] = {
    "Yönetici": [
        "Ana Sayfa",
        "Müşteri Merkezi",
        "Müşteri İletişim",
        "Satış / Sipariş",
        "Üretim / Atölye",
        "Ürün & Stok Merkezi",
        "Tedarik Merkezi",
        "E-Ticaret",
        "Finans",
        "Fiyat / Maliyet",
        "Raporlar",
        "Evrak Dolabı",
        "Sistem",
    ],
    "Personel": [
        "Ana Sayfa",
        "Müşteri Merkezi",
        "Müşteri İletişim",
        "Satış / Sipariş",
        "Üretim / Atölye",
        "Ürün & Stok Merkezi",
        "E-Ticaret",
        "Evrak Dolabı",
    ],
    "Tam Yetki": [
        "Ana Sayfa",
        "Müşteri Merkezi",
        "Müşteri İletişim",
        "Satış / Sipariş",
        "Üretim / Atölye",
        "Ürün & Stok Merkezi",
        "Tedarik Merkezi",
        "E-Ticaret",
        "Finans",
        "Fiyat / Maliyet",
        "Raporlar",
        "Evrak Dolabı",
        "Sistem",
    ],
    "Sadece Satış": [
        "Ana Sayfa",
        "Müşteri Merkezi",
        "Müşteri İletişim",
        "Satış / Sipariş",
        "E-Ticaret",
        "Fiyat / Maliyet",
        "Evrak Dolabı",
        "Sistem",
    ],
    "Sadece Stok": [
        "Ana Sayfa",
        "Ürün & Stok Merkezi",
        "Tedarik Merkezi",
        "Fiyat / Maliyet",
        "Evrak Dolabı",
        "Sistem",
    ],
}

# Nav grup → API path prefix (longest-first match).
GROUP_API_PREFIXES: dict[str, list[str]] = {
    "Ana Sayfa": ["/api/dashboard", "/api/search"],
    "Müşteri Merkezi": ["/api/customers"],
    "Müşteri İletişim": ["/api/whatsapp", "/api/crm", "/api/directory"],
    "Satış / Sipariş": ["/api/orders", "/api/quotes"],
    "Üretim / Atölye": ["/api/production"],
    "Ürün & Stok Merkezi": ["/api/products", "/api/stock"],
    "Tedarik Merkezi": ["/api/suppliers", "/api/purchases"],
    "E-Ticaret": [],  # UI hub; sipariş API Satış grubundan
    "Finans": ["/api/finance", "/api/loans"],
    "Fiyat / Maliyet": ["/api/price-lists", "/api/tools"],
    "Raporlar": ["/api/reports"],
    "Evrak Dolabı": ["/api/documents"],
    "Sistem": ["/api/settings", "/api/audit", "/api/tasks"],
}

# Her zaman açık (oturum + kilit ayarını okumak için).
ALWAYS_ALLOW_PREFIXES: tuple[str, ...] = (
    "/api/auth",
    "/health",
)

# GET /api/settings/app — Sidebar/lock UI bootstrap (Personel dahil).
ALWAYS_ALLOW_GET_PATHS: frozenset[str] = frozenset(
    {
        "/api/settings/app",
    }
)


def normalize_mode(mode: str | None) -> str:
    m = (mode or "Yönetici").strip()
    if m not in LOCK_MODE_ALLOWED_GROUPS:
        return "Yönetici"
    return m


def allowed_prefixes_for_mode(mode: str | None) -> list[str]:
    m = normalize_mode(mode)
    groups = LOCK_MODE_ALLOWED_GROUPS[m]
    prefixes: list[str] = []
    seen: set[str] = set()
    for g in groups:
        for p in GROUP_API_PREFIXES.get(g, []):
            if p not in seen:
                seen.add(p)
                prefixes.append(p)
    return prefixes


def path_allowed(mode: str | None, path: str, method: str = "GET") -> bool:
    """Return True if lock mode permits this API path."""
    raw = (path or "").split("?", 1)[0]
    if not raw.startswith("/"):
        raw = "/" + raw
    # strip trailing slash except root
    if len(raw) > 1 and raw.endswith("/"):
        raw = raw.rstrip("/")

    for p in ALWAYS_ALLOW_PREFIXES:
        if raw == p or raw.startswith(p + "/"):
            return True

    if method.upper() == "GET" and raw in ALWAYS_ALLOW_GET_PATHS:
        return True

    # Non-API (shouldn't hit middleware) — allow
    if not raw.startswith("/api"):
        return True

    allowed = allowed_prefixes_for_mode(mode)
    # Sort longer prefixes first so /api/settings/backups matches /api/settings
    for pref in sorted(allowed, key=len, reverse=True):
        if raw == pref or raw.startswith(pref + "/"):
            return True
    return False


def blocked_detail(mode: str | None, path: str) -> str:
    m = normalize_mode(mode)
    return f"Kilit modu ({m}) bu API yoluna izin vermiyor: {path}"


def modes() -> Iterable[str]:
    return LOCK_MODE_ALLOWED_GROUPS.keys()
