"""BizimHesap B2B HTTP client (products / warehouses / inventory).

Auth headers: Key (public) + Token (account). Cloudflare requires a browser-like
User-Agent; bare urllib without UA gets Error 1010.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_BASE = "https://bizimhesap.com/api/b2b"
DEFAULT_PUBLIC_KEY = "BZMHB2B724018943908D0B82491F203F"
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class BizimHesapAPIError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: str | None = None):
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class BizimHesapB2BClient:
    token: str
    public_key: str = DEFAULT_PUBLIC_KEY
    base_url: str = DEFAULT_BASE
    timeout: float = 120.0

    def _headers(self) -> dict[str, str]:
        return {
            "Key": self.public_key,
            "Token": self.token,
            "User-Agent": CHROME_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        }

    def get_json(self, path: str, *, retries: int = 5) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        last_err: Exception | None = None
        for attempt in range(retries):
            req = urllib.request.Request(url, headers=self._headers(), method="GET")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                    status = getattr(resp, "status", 200)
                break
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
                last_err = BizimHesapAPIError(
                    f"HTTP {exc.code} for {path}: {body[:300]}",
                    status=exc.code,
                    body=body,
                )
                if exc.code in (429, 503, 502) and attempt < retries - 1:
                    wait = 2 ** attempt + 1
                    time.sleep(wait)
                    continue
                raise last_err from exc
            except urllib.error.URLError as exc:
                last_err = BizimHesapAPIError(f"Network error for {path}: {exc}")
                if attempt < retries - 1:
                    time.sleep(2 ** attempt + 1)
                    continue
                raise last_err from exc
        else:
            raise last_err or BizimHesapAPIError(f"Failed GET {path}")

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BizimHesapAPIError(
                f"Non-JSON response for {path} (HTTP {status}): {raw[:200]}",
                status=status,
                body=raw,
            ) from exc

        if not isinstance(data, dict):
            raise BizimHesapAPIError(f"Unexpected payload type for {path}: {type(data)}")

        code = data.get("resultCode")
        # Docs / probes: resultCode == 1 means success
        if code is not None and int(code) != 1:
            raise BizimHesapAPIError(
                f"API error for {path}: resultCode={code} {data.get('errorText') or ''}".strip(),
                status=status,
                body=raw[:500],
            )
        return data

    def fetch_products(self) -> list[dict[str, Any]]:
        payload = self.get_json("products")
        data = payload.get("data") or {}
        products = data.get("products") if isinstance(data, dict) else None
        if not isinstance(products, list):
            raise BizimHesapAPIError("products response missing data.products list")
        return products

    def fetch_warehouses(self) -> list[dict[str, Any]]:
        payload = self.get_json("warehouses")
        data = payload.get("data") or {}
        warehouses = data.get("warehouses") if isinstance(data, dict) else None
        if not isinstance(warehouses, list):
            raise BizimHesapAPIError("warehouses response missing data.warehouses list")
        return warehouses

    def fetch_inventory(self, warehouse_id: str) -> list[dict[str, Any]]:
        payload = self.get_json(f"inventory/{warehouse_id}")
        data = payload.get("data") or {}
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("inventory", "items", "stocks"):
                items = data.get(key)
                if isinstance(items, list):
                    return items
        raise BizimHesapAPIError(f"inventory/{warehouse_id} response missing inventory list")
