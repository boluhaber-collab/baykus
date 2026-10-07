"""Çoklu e-posta hesabı — yerel dosya apps/api/data/mail_accounts.json (git dışı).

Şifreler veritabanına yazılmaz; sadece bu yerel dosyada tutulur ve API'den
maskelenmiş (••••••••) döner. Eski tek hesap ayarı (data/mail_config.env veya
MAIL_* ortam değişkenleri) ilk açılışta otomatik olarak hesap #1'e taşınır.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any

from app.services.mail_config import CONFIG_PATH as LEGACY_CONFIG_PATH
from app.services.mail_config import MASK, MailConfig, load_mail_config

log = logging.getLogger("baykus.mail_accounts")

_API_DIR = Path(__file__).resolve().parents[2]  # apps/api
ACCOUNTS_PATH = _API_DIR / "data" / "mail_accounts.json"

_file_lock = threading.RLock()

_CFG_FIELDS = tuple(f.name for f in fields(MailConfig))


@dataclass
class MailAccount(MailConfig):
    id: int = 0
    label: str = ""
    is_default: bool = False
    active: bool = True

    def display_name(self) -> str:
        addr = (self.from_email or self.smtp_user or self.imap_user or "").strip()
        lbl = (self.label or "").strip()
        if lbl and addr and lbl.lower() != addr.lower():
            return f"{lbl} ({addr})"
        return lbl or addr or f"Hesap #{self.id}"


def _to_bool(v: Any, default: bool) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "evet", "on")


def _to_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except Exception:  # noqa: BLE001
        return default


def _account_from_dict(d: dict[str, Any]) -> MailAccount:
    return MailAccount(
        id=_to_int(d.get("id"), 0),
        label=str(d.get("label") or "").strip(),
        is_default=_to_bool(d.get("is_default"), False),
        active=_to_bool(d.get("active"), True),
        smtp_host=str(d.get("smtp_host") or "").strip(),
        smtp_port=_to_int(d.get("smtp_port"), 587),
        smtp_user=str(d.get("smtp_user") or "").strip(),
        smtp_password=str(d.get("smtp_password") or ""),
        smtp_use_tls=_to_bool(d.get("smtp_use_tls"), True),
        from_name=str(d.get("from_name") or "").strip() or "Baykuş Baskı",
        from_email=str(d.get("from_email") or "").strip(),
        imap_host=str(d.get("imap_host") or "").strip(),
        imap_port=_to_int(d.get("imap_port"), 993),
        imap_user=str(d.get("imap_user") or "").strip(),
        imap_password=str(d.get("imap_password") or ""),
        imap_use_ssl=_to_bool(d.get("imap_use_ssl"), True),
        imap_folder=str(d.get("imap_folder") or "INBOX").strip() or "INBOX",
    )


def _legacy_has_values(c: MailConfig) -> bool:
    return bool(
        c.smtp_host.strip()
        or c.imap_host.strip()
        or c.smtp_user.strip()
        or c.from_email.strip()
        or c.smtp_password
    )


def _write_store(store: dict[str, Any]) -> None:
    ACCOUNTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = ACCOUNTS_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, ACCOUNTS_PATH)


def _normalize(store: dict[str, Any]) -> dict[str, Any]:
    raw = store.get("accounts")
    accounts = [a for a in raw if isinstance(a, dict)] if isinstance(raw, list) else []
    max_id = max([_to_int(a.get("id"), 0) for a in accounts] or [0])
    next_id = max(_to_int(store.get("next_id"), 1), max_id + 1)
    # exactly one default (prefer an active one)
    defaults = [a for a in accounts if _to_bool(a.get("is_default"), False)]
    if accounts and len(defaults) != 1:
        keep = None
        for a in defaults:
            if _to_bool(a.get("active"), True):
                keep = a
                break
        if keep is None:
            keep = defaults[0] if defaults else next(
                (a for a in accounts if _to_bool(a.get("active"), True)), accounts[0]
            )
        for a in accounts:
            a["is_default"] = a is keep
    return {"version": 1, "next_id": next_id, "accounts": accounts}


def _load_store() -> dict[str, Any]:
    """Read store; migrate legacy single config on first run."""
    with _file_lock:
        if ACCOUNTS_PATH.is_file():
            try:
                data = json.loads(ACCOUNTS_PATH.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return _normalize(data)
            except Exception as exc:  # noqa: BLE001
                log.warning("mail_accounts.json okunamadı: %s", exc)
                # Corrupt file: keep a backup copy before any later write replaces it
                try:
                    import shutil
                    import time

                    backup = ACCOUNTS_PATH.with_name(f"mail_accounts.corrupt-{int(time.time())}.json")
                    if not backup.exists():
                        shutil.copy2(ACCOUNTS_PATH, backup)
                except OSError:
                    pass
                return {"version": 1, "next_id": 1, "accounts": []}
        return _migrate_legacy()


def _migrate_legacy() -> dict[str, Any]:
    legacy = load_mail_config()
    accounts: list[dict[str, Any]] = []
    if _legacy_has_values(legacy):
        acc = MailAccount(
            **{k: getattr(legacy, k) for k in _CFG_FIELDS},
            id=1,
            label=(legacy.from_email or legacy.smtp_user or "Ana hesap").strip(),
            is_default=True,
            active=True,
        )
        accounts.append(asdict(acc))
    store = {"version": 1, "next_id": 2, "accounts": accounts}
    try:
        _write_store(store)
        if accounts:
            print(
                f"[baykus] mail: tek hesap ayarı hesap #1'e taşındı ({LEGACY_CONFIG_PATH.name} korunuyor)",
                flush=True,
            )
    except OSError as exc:
        log.warning("mail_accounts.json yazılamadı: %s", exc)
    return store


def ensure_accounts_migrated() -> list[MailAccount]:
    return list_accounts()


def list_accounts() -> list[MailAccount]:
    store = _load_store()
    out = [_account_from_dict(a) for a in store["accounts"]]
    out.sort(key=lambda a: (not a.is_default, a.id))
    return out


def get_account(account_id: int | None) -> MailAccount | None:
    if account_id is None:
        return get_default_account()
    for a in list_accounts():
        if a.id == int(account_id):
            return a
    return None


def get_default_account() -> MailAccount | None:
    accs = list_accounts()
    for a in accs:
        if a.is_default and a.active:
            return a
    for a in accs:
        if a.active:
            return a
    return accs[0] if accs else None


def sync_targets(account_id: int | None = None) -> list[MailAccount]:
    """Active + IMAP-configured accounts (optionally a single one)."""
    accs = [a for a in list_accounts() if a.active and a.imap_configured]
    if account_id is not None:
        accs = [a for a in accs if a.id == int(account_id)]
    return accs


def _apply_update(base: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Merge user update into stored dict; blank/mask passwords keep previous."""
    out = dict(base)
    clear_smtp = bool(data.pop("clear_smtp_password", False))
    clear_imap = bool(data.pop("clear_imap_password", False))
    for key in (
        "label",
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_use_tls",
        "from_name",
        "from_email",
        "imap_host",
        "imap_port",
        "imap_user",
        "imap_use_ssl",
        "imap_folder",
        "active",
    ):
        if key in data and data[key] is not None:
            v = data[key]
            out[key] = v.strip() if isinstance(v, str) else v
    for key, clear in (("smtp_password", clear_smtp), ("imap_password", clear_imap)):
        if clear:
            out[key] = ""
            continue
        pw = data.get(key)
        if pw is not None and str(pw) != "" and str(pw) != MASK:
            out[key] = str(pw)
    # re-validate through dataclass
    acc = _account_from_dict(out)
    return asdict(acc)


def create_account(data: dict[str, Any]) -> MailAccount:
    with _file_lock:
        store = _load_store()
        new_id = int(store["next_id"])
        base = asdict(MailAccount(id=new_id))
        merged = _apply_update(base, dict(data))
        merged["id"] = new_id
        make_default = bool(data.get("is_default")) or not store["accounts"]
        if make_default:
            for a in store["accounts"]:
                a["is_default"] = False
        merged["is_default"] = make_default
        if not merged.get("label"):
            merged["label"] = (merged.get("from_email") or merged.get("smtp_user") or f"Hesap {new_id}").strip()
        store["accounts"].append(merged)
        store["next_id"] = new_id + 1
        _write_store(_normalize(store))
    acc = get_account(new_id)
    assert acc is not None
    return acc


def update_account(account_id: int, data: dict[str, Any]) -> MailAccount | None:
    with _file_lock:
        store = _load_store()
        idx = next((i for i, a in enumerate(store["accounts"]) if _to_int(a.get("id"), 0) == int(account_id)), None)
        if idx is None:
            return None
        cur = store["accounts"][idx]
        merged = _apply_update(cur, dict(data))
        merged["id"] = int(account_id)
        merged["is_default"] = _to_bool(cur.get("is_default"), False)
        if data.get("is_default"):
            for a in store["accounts"]:
                a["is_default"] = False
            merged["is_default"] = True
        store["accounts"][idx] = merged
        _write_store(_normalize(store))
    return get_account(account_id)


def delete_account(account_id: int) -> bool:
    with _file_lock:
        store = _load_store()
        before = len(store["accounts"])
        was_default = any(
            _to_int(a.get("id"), 0) == int(account_id) and _to_bool(a.get("is_default"), False)
            for a in store["accounts"]
        )
        store["accounts"] = [a for a in store["accounts"] if _to_int(a.get("id"), 0) != int(account_id)]
        if len(store["accounts"]) == before:
            return False
        if was_default and store["accounts"]:
            nxt = next((a for a in store["accounts"] if _to_bool(a.get("active"), True)), store["accounts"][0])
            nxt["is_default"] = True
        _write_store(_normalize(store))
    return True


def set_default_account(account_id: int) -> MailAccount | None:
    with _file_lock:
        store = _load_store()
        found = False
        for a in store["accounts"]:
            is_it = _to_int(a.get("id"), 0) == int(account_id)
            a["is_default"] = is_it
            if is_it:
                a["active"] = True
                found = True
        if not found:
            return None
        _write_store(_normalize(store))
    return get_account(account_id)


def merged_test_config(account_id: int | None, data: dict[str, Any]) -> MailAccount:
    """Form values for SMTP/IMAP test; blank password → saved password of that account."""
    base_acc = get_account(account_id) if account_id else None
    base = asdict(base_acc) if base_acc else asdict(MailAccount(id=0))
    return _account_from_dict(_apply_update(base, dict(data)))


def public_account_dict(a: MailAccount) -> dict[str, Any]:
    return {
        "id": a.id,
        "label": a.label,
        "display_name": a.display_name(),
        "is_default": a.is_default,
        "active": a.active,
        "smtp_host": a.smtp_host,
        "smtp_port": a.smtp_port,
        "smtp_user": a.smtp_user,
        "smtp_password": MASK if a.smtp_password else "",
        "smtp_use_tls": a.smtp_use_tls,
        "from_name": a.from_name,
        "from_email": a.from_email,
        "imap_host": a.imap_host,
        "imap_port": a.imap_port,
        "imap_user": a.imap_user,
        "imap_password": MASK if a.imap_password else "",
        "imap_use_ssl": a.imap_use_ssl,
        "imap_folder": a.imap_folder,
        "smtp_configured": a.smtp_configured,
        "imap_configured": a.imap_configured,
        "effective_from": a.effective_from(),
    }
