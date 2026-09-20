"""BizimHesap API skeleton — never calls network without real keys.

When api_key/api_secret are empty: returns clear "not configured" / mock OK.
With keys present: still stubbed (no real HTTP) so fake keys cannot hang.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BizimHesapClient:
    api_key: str = ""
    api_secret: str = ""

    @property
    def configured(self) -> bool:
        return bool((self.api_key or "").strip() and (self.api_secret or "").strip())

    def test_connection(self) -> dict:
        if not self.configured:
            return {
                "ok": False,
                "status": "not_configured",
                "message": "BizimHesap API anahtarı tanımlı değil. Ayarlar → Entegrasyonlar’dan kaydedin.",
                "detail": None,
            }
        # Keys present but real HTTP intentionally not called in this skeleton
        return {
            "ok": True,
            "status": "mock_ok",
            "message": "Anahtarlar kayıtlı — bağlantı testi iskelet modunda (gerçek API çağrısı yok).",
            "detail": {"mode": "stub", "has_key": True},
        }

    def sync_customers(self) -> dict:
        if not self.configured:
            return {
                "ok": False,
                "status": "not_configured",
                "message": "Müşteri senkronu yapılamadı: BizimHesap yapılandırılmamış.",
                "detail": None,
            }
        return {
            "ok": True,
            "status": "mock_ok",
            "message": "Müşteri senkronu iskelet — 0 kayıt (mock).",
            "detail": {"synced": 0, "mode": "stub"},
        }

    def sync_products(self) -> dict:
        if not self.configured:
            return {
                "ok": False,
                "status": "not_configured",
                "message": "Ürün senkronu yapılamadı: BizimHesap yapılandırılmamış.",
                "detail": None,
            }
        return {
            "ok": True,
            "status": "mock_ok",
            "message": "Ürün senkronu iskelet — 0 kayıt (mock).",
            "detail": {"synced": 0, "mode": "stub"},
        }


def client_from_settings(api_key: str = "", api_secret: str = "") -> BizimHesapClient:
    return BizimHesapClient(api_key=api_key or "", api_secret=api_secret or "")
