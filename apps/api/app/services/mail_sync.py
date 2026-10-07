"""Inbox IMAP import + autosync state (shared by /sync API and background thread)."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.mail import MailMessage
from app.models.supplier import Supplier
from app.services.mail_accounts import MailAccount, get_account, list_accounts, sync_targets
from app.services.mail_transport import fetch_recent_imap

log = logging.getLogger("baykus.mail_sync")

_API_DIR = Path(__file__).resolve().parents[2]  # apps/api
_STATE_PATH = _API_DIR / "data" / "mail_sync_state.json"
_ATTACH_ROOT = _API_DIR / "data" / "mail_attachments"

_stop_event = threading.Event()
_thread: threading.Thread | None = None

AUTOSYNC_INTERVAL_SEC = 30 * 60  # 30 minutes
AUTOSYNC_BOOT_DELAY_SEC = 20


def _email_from_addr(raw: str) -> str:
    if not raw:
        return ""
    m = re.search(r"<([^>]+)>", raw)
    if m:
        return m.group(1).strip().lower()
    return raw.strip().lower()


def _match_customer(db: Session, from_addr: str) -> int | None:
    email = _email_from_addr(from_addr)
    if not email or "@" not in email:
        return None
    row = (
        db.query(Customer)
        .filter(Customer.email.isnot(None), Customer.email != "")
        .filter(Customer.email.ilike(email))
        .first()
    )
    return row.id if row else None


def _match_supplier(db: Session, from_addr: str) -> int | None:
    email = _email_from_addr(from_addr)
    if not email or "@" not in email:
        return None
    row = (
        db.query(Supplier)
        .filter(Supplier.email.isnot(None), Supplier.email != "")
        .filter(Supplier.email.ilike(email))
        .first()
    )
    return row.id if row else None


def _safe_filename(name: str, index: int) -> str:
    base = re.sub(r"[^\w.\- ()\u00c0-\u024f]+", "_", name or f"ek-{index}", flags=re.UNICODE)
    base = base.strip(" ._") or f"ek-{index}"
    return base[:180]


def attachment_dir(message_id: int) -> Path:
    return _ATTACH_ROOT / str(int(message_id))


def store_attachments(message_id: int, attachments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Write attachment bytes to disk; return JSON-safe metadata list."""
    if not attachments:
        return []
    dest = attachment_dir(message_id)
    dest.mkdir(parents=True, exist_ok=True)
    meta: list[dict[str, Any]] = []
    for i, att in enumerate(attachments):
        data = att.get("data")
        if not isinstance(data, (bytes, bytearray)) or not data:
            continue
        fname = _safe_filename(str(att.get("filename") or f"ek-{i + 1}"), i + 1)
        stored = f"{i + 1:02d}_{fname}"
        path = dest / stored
        try:
            path.write_bytes(bytes(data))
        except OSError as exc:
            log.warning("mail attachment write failed id=%s file=%s: %s", message_id, stored, exc)
            continue
        meta.append(
            {
                "filename": str(att.get("filename") or fname)[:200],
                "content_type": str(att.get("content_type") or "application/octet-stream")[:120],
                "size": len(data),
                "stored_name": stored,
            }
        )
    return meta


def resolve_attachment_path(message_id: int, stored_name: str) -> Path | None:
    if not stored_name or ".." in stored_name or "/" in stored_name or "\\" in stored_name:
        return None
    path = attachment_dir(message_id) / stored_name
    if not path.is_file():
        return None
    return path


_EMPTY_STATE: dict[str, Any] = {
    "last_sync_at": None,
    "last_ok": None,
    "last_message": "",
    "imported": 0,
    "linked": 0,
    "skipped": False,
}

_state_lock = threading.Lock()
_account_locks: dict[int, threading.Lock] = {}
_account_locks_guard = threading.Lock()


def _lock_for(account_id: int) -> threading.Lock:
    """One overlap lock per account (autosync + manual share it)."""
    with _account_locks_guard:
        lk = _account_locks.get(int(account_id))
        if lk is None:
            lk = threading.Lock()
            _account_locks[int(account_id)] = lk
        return lk


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _read_state_file() -> dict[str, Any]:
    if not _STATE_PATH.is_file():
        return {}
    try:
        data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:  # noqa: BLE001
        pass
    return {}


def load_sync_state(account_id: int | None = None) -> dict[str, Any]:
    """Global (last run across accounts) or per-account sync state."""
    data = _read_state_file()
    if account_id is None:
        out = dict(_EMPTY_STATE)
        out.update({k: data.get(k, v) for k, v in _EMPTY_STATE.items()})
        return out
    per = data.get("accounts") if isinstance(data.get("accounts"), dict) else {}
    st = per.get(str(int(account_id))) if isinstance(per, dict) else None
    out = dict(_EMPTY_STATE)
    if isinstance(st, dict):
        out.update(st)
    return out


def save_sync_state(account_id: int | None = None, **kwargs: Any) -> dict[str, Any]:
    with _state_lock:
        data = _read_state_file()
        entry = dict(_EMPTY_STATE)
        if account_id is not None:
            per = data.get("accounts") if isinstance(data.get("accounts"), dict) else {}
            prev = per.get(str(int(account_id))) if isinstance(per, dict) else None
            if isinstance(prev, dict):
                entry.update(prev)
        else:
            entry.update({k: data.get(k, v) for k, v in _EMPTY_STATE.items()})
        entry.update(kwargs)
        if "last_sync_at" not in kwargs:
            entry["last_sync_at"] = _now_iso()
        if account_id is not None:
            per = data.get("accounts") if isinstance(data.get("accounts"), dict) else {}
            per[str(int(account_id))] = entry
            data["accounts"] = per
        else:
            data.update(entry)
        try:
            _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            _STATE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("mail sync state write failed: %s", exc)
        return entry


def import_inbox(
    db: Session,
    account: MailAccount,
    *,
    limit: int = 40,
    unseen_only: bool = False,
) -> dict[str, Any]:
    """Fetch IMAP for one account and persist new inbox rows. Caller owns the Session."""
    result = fetch_recent_imap(limit=limit, unseen_only=unseen_only, cfg=account)
    if not result.get("ok"):
        out = {
            "ok": False,
            "message": str(result.get("message") or "Senkron başarısız"),
            "imported": 0,
            "linked": 0,
        }
        save_sync_state(
            account.id,
            last_ok=False,
            last_message=out["message"],
            imported=0,
            linked=0,
            skipped=False,
        )
        return out

    imported = 0
    linked = 0
    for m in result.get("messages") or []:
        mid = m.get("message_id")
        uid = m.get("imap_uid")
        exists = None
        if mid:
            exists = (
                db.query(MailMessage)
                .filter(MailMessage.message_id == mid, MailMessage.account_id == account.id)
                .first()
            )
        if not exists and uid:
            exists = (
                db.query(MailMessage)
                .filter(
                    MailMessage.folder == "inbox",
                    MailMessage.imap_uid == str(uid),
                    MailMessage.account_id == account.id,
                )
                .first()
            )
        if exists:
            continue
        cust_id = _match_customer(db, m.get("from_addr") or "")
        sup_id = _match_supplier(db, m.get("from_addr") or "") if not cust_id else None
        if cust_id or sup_id:
            linked += 1
        row = MailMessage(
            account_id=account.id,
            folder="inbox",
            direction="in",
            message_id=mid,
            imap_uid=str(uid) if uid else None,
            from_addr=m.get("from_addr") or "",
            to_addrs=m.get("to_addrs") or "",
            cc_addrs=m.get("cc_addrs"),
            subject=m.get("subject") or "(konu yok)",
            body_text=m.get("body_text") or "",
            body_html=m.get("body_html"),
            date_sent=m.get("date_sent"),
            is_read=bool(m.get("is_read")),
            customer_id=cust_id,
            supplier_id=sup_id,
            attachments_json=None,
        )
        db.add(row)
        db.flush()  # get id
        meta = store_attachments(row.id, list(m.get("attachments") or []))
        if meta:
            row.attachments_json = json.dumps(meta, ensure_ascii=False)
        imported += 1
    db.commit()
    msg = f"{imported} yeni mesaj içe aktarıldı" + (
        f", {linked} müşteri/tedarikçiye bağlandı" if linked else ""
    )
    out = {"ok": True, "message": msg, "imported": imported, "linked": linked}
    save_sync_state(
        account.id,
        last_ok=True,
        last_message=msg,
        imported=imported,
        linked=linked,
        skipped=False,
    )
    return out


def _sync_accounts(
    db: Session,
    accounts: list[MailAccount],
    *,
    limit: int,
    unseen_only: bool,
    wait_timeout: float | None,
) -> dict[str, Any]:
    """Sync several accounts sequentially; each guarded by its own lock."""
    results: list[dict[str, Any]] = []
    total_imp = 0
    total_link = 0
    any_ok = False
    any_fail = False
    for acc in accounts:
        lk = _lock_for(acc.id)
        acquired = lk.acquire(blocking=False) if wait_timeout is None else lk.acquire(timeout=wait_timeout)
        if not acquired:
            results.append(
                {
                    "account_id": acc.id,
                    "account": acc.display_name(),
                    "ok": False,
                    "skipped": True,
                    "message": "Senkron zaten çalışıyor",
                    "imported": 0,
                    "linked": 0,
                }
            )
            continue
        try:
            try:
                r = import_inbox(db, acc, limit=limit, unseen_only=unseen_only)
            except Exception as exc:  # noqa: BLE001
                log.exception("mail sync failed account=%s", acc.id)
                db.rollback()
                r = {"ok": False, "message": f"Senkron hatası: {exc}"[:400], "imported": 0, "linked": 0}
                save_sync_state(acc.id, last_ok=False, last_message=r["message"], imported=0, linked=0, skipped=False)
        finally:
            lk.release()
        if r.get("ok"):
            any_ok = True
        else:
            any_fail = True
        total_imp += int(r.get("imported") or 0)
        total_link += int(r.get("linked") or 0)
        results.append({"account_id": acc.id, "account": acc.display_name(), **r})

    if not accounts:
        msg = "Senkronize edilecek aktif IMAP hesabı yok"
        save_sync_state(None, last_ok=None, last_message=msg, imported=0, linked=0, skipped=True)
        return {"ok": False, "message": msg, "imported": 0, "linked": 0, "results": [], "skipped": True}

    if len(results) == 1:
        r0 = results[0]
        msg = str(r0.get("message") or "")
        if len(accounts) == 1 and len(list_accounts()) > 1:
            msg = f"{r0.get('account')}: {msg}"
    else:
        parts = [f"{r.get('account')}: {r.get('message')}" for r in results]
        msg = f"Toplam {total_imp} yeni mesaj · " + " | ".join(parts)
    ok = any_ok  # kısmi başarıda hatalı hesap mesajda yazıyor
    save_sync_state(
        None,
        last_ok=(not any_fail),
        last_message=msg[:600],
        imported=total_imp,
        linked=total_link,
        skipped=False,
    )
    return {
        "ok": ok,
        "message": msg[:600],
        "imported": total_imp,
        "linked": total_link,
        "results": results,
    }


def run_autosync_once() -> dict[str, Any]:
    """Single autosync tick over all active IMAP-configured accounts."""
    try:
        targets = sync_targets()
        if not targets:
            save_sync_state(
                None,
                last_ok=None,
                last_message="IMAP yapılandırılmış aktif hesap yok — otomatik senkron atlandı",
                imported=0,
                linked=0,
                skipped=True,
            )
            return {"ok": False, "message": "IMAP yapılandırılmadı", "skipped": True}

        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            return _sync_accounts(db, targets, limit=40, unseen_only=False, wait_timeout=None)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        log.exception("mail autosync failed")
        save_sync_state(
            None,
            last_ok=False,
            last_message=f"Otomatik senkron hatası: {exc}"[:400],
            imported=0,
            linked=0,
            skipped=False,
        )
        return {"ok": False, "message": str(exc)[:400]}


def run_manual_sync(
    db: Session,
    *,
    account_id: int | None = None,
    limit: int = 40,
    unseen_only: bool = False,
) -> dict[str, Any]:
    """API-triggered sync (selected account or all active); waits briefly per-account lock."""
    targets = sync_targets(account_id)
    if account_id is not None and not targets:
        acc = get_account(account_id)
        if acc is None:
            return {"ok": False, "message": "Hesap bulunamadı", "imported": 0, "linked": 0}
        if not acc.active:
            return {"ok": False, "message": "Hesap pasif — önce aktif edin", "imported": 0, "linked": 0}
        return {"ok": False, "message": "Bu hesabın IMAP ayarları eksik", "imported": 0, "linked": 0}
    return _sync_accounts(db, targets, limit=limit, unseen_only=unseen_only, wait_timeout=90)


def _autosync_loop() -> None:
    log.info("mail autosync thread started (every %ss)", AUTOSYNC_INTERVAL_SEC)
    # Boot delay: let migrations / DB settle
    if _stop_event.wait(AUTOSYNC_BOOT_DELAY_SEC):
        return
    while not _stop_event.is_set():
        try:
            run_autosync_once()
        except Exception:  # noqa: BLE001
            log.exception("mail autosync loop error (ignored)")
        if _stop_event.wait(AUTOSYNC_INTERVAL_SEC):
            break
    log.info("mail autosync thread stopped")


def start_mail_autosync() -> None:
    """Daemon thread — safe to call once at FastAPI startup."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_autosync_loop, name="baykus-mail-autosync", daemon=True)
    _thread.start()
    print("[baykus] mail autosync: every 30 min for all active IMAP accounts", flush=True)


def stop_mail_autosync() -> None:
    _stop_event.set()


def parse_attachments_meta(raw: str | None) -> list[dict[str, Any]]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except Exception:  # noqa: BLE001
        pass
    return []


def build_eml_bytes(row: MailMessage) -> bytes:
    """Rebuild a simple .eml from stored fields (+ on-disk attachments if any)."""
    from email.message import EmailMessage
    from email.utils import format_datetime

    msg = EmailMessage()
    msg["Subject"] = row.subject or "(konu yok)"
    msg["From"] = row.from_addr or ""
    msg["To"] = row.to_addrs or ""
    if row.cc_addrs:
        msg["Cc"] = row.cc_addrs
    if row.message_id:
        msg["Message-ID"] = row.message_id
    if row.date_sent:
        try:
            dt = row.date_sent
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            msg["Date"] = format_datetime(dt)
        except Exception:  # noqa: BLE001
            pass

    body = row.body_text or ""
    meta = parse_attachments_meta(row.attachments_json)
    if not meta:
        msg.set_content(body)
    else:
        msg.set_content(body)
        for att in meta:
            stored = str(att.get("stored_name") or "")
            path = resolve_attachment_path(row.id, stored)
            if path is None:
                continue
            data = path.read_bytes()
            maintype, _, subtype = str(att.get("content_type") or "application/octet-stream").partition("/")
            if not subtype:
                maintype, subtype = "application", "octet-stream"
            msg.add_attachment(
                data,
                maintype=maintype or "application",
                subtype=subtype or "octet-stream",
                filename=str(att.get("filename") or stored),
            )
    return msg.as_bytes()
