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
from app.services.mail_config import load_mail_config
from app.services.mail_transport import fetch_recent_imap

log = logging.getLogger("baykus.mail_sync")

_API_DIR = Path(__file__).resolve().parents[2]  # apps/api
_STATE_PATH = _API_DIR / "data" / "mail_sync_state.json"
_ATTACH_ROOT = _API_DIR / "data" / "mail_attachments"

_sync_lock = threading.Lock()
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


def load_sync_state() -> dict[str, Any]:
    if not _STATE_PATH.is_file():
        return {
            "last_sync_at": None,
            "last_ok": None,
            "last_message": "",
            "imported": 0,
            "linked": 0,
            "skipped": False,
        }
    try:
        data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:  # noqa: BLE001
        pass
    return {
        "last_sync_at": None,
        "last_ok": None,
        "last_message": "",
        "imported": 0,
        "linked": 0,
        "skipped": False,
    }


def save_sync_state(**kwargs: Any) -> dict[str, Any]:
    cur = load_sync_state()
    cur.update(kwargs)
    if "last_sync_at" not in kwargs:
        cur["last_sync_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")
    try:
        _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATE_PATH.write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        log.warning("mail sync state write failed: %s", exc)
    return cur


def import_inbox(
    db: Session,
    *,
    limit: int = 40,
    unseen_only: bool = False,
) -> dict[str, Any]:
    """Fetch IMAP and persist new inbox rows. Caller owns the Session."""
    result = fetch_recent_imap(limit=limit, unseen_only=unseen_only)
    if not result.get("ok"):
        out = {
            "ok": False,
            "message": str(result.get("message") or "Senkron başarısız"),
            "imported": 0,
            "linked": 0,
        }
        save_sync_state(
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
            exists = db.query(MailMessage).filter(MailMessage.message_id == mid).first()
        if not exists and uid:
            exists = (
                db.query(MailMessage)
                .filter(MailMessage.folder == "inbox", MailMessage.imap_uid == str(uid))
                .first()
            )
        if exists:
            continue
        cust_id = _match_customer(db, m.get("from_addr") or "")
        sup_id = _match_supplier(db, m.get("from_addr") or "") if not cust_id else None
        if cust_id or sup_id:
            linked += 1
        row = MailMessage(
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
        last_ok=True,
        last_message=msg,
        imported=imported,
        linked=linked,
        skipped=False,
    )
    return out


def run_autosync_once() -> dict[str, Any]:
    """Single autosync tick; skips if another sync holds the lock or IMAP not configured."""
    if not _sync_lock.acquire(blocking=False):
        log.info("mail autosync skipped (already running)")
        return {"ok": False, "message": "Senkron zaten çalışıyor", "skipped": True}
    try:
        cfg = load_mail_config()
        if not cfg.imap_configured:
            save_sync_state(
                last_ok=None,
                last_message="IMAP yapılandırılmadı — otomatik senkron atlandı",
                imported=0,
                linked=0,
                skipped=True,
            )
            return {"ok": False, "message": "IMAP yapılandırılmadı", "skipped": True}

        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            return import_inbox(db, limit=40, unseen_only=False)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        log.exception("mail autosync failed")
        save_sync_state(
            last_ok=False,
            last_message=f"Otomatik senkron hatası: {exc}"[:400],
            imported=0,
            linked=0,
            skipped=False,
        )
        return {"ok": False, "message": str(exc)[:400]}
    finally:
        _sync_lock.release()


def run_manual_sync(db: Session, *, limit: int = 40, unseen_only: bool = False) -> dict[str, Any]:
    """API-triggered sync; waits for lock (short) so it does not overlap autosync writes."""
    acquired = _sync_lock.acquire(timeout=90)
    if not acquired:
        return {
            "ok": False,
            "message": "Başka bir senkron çalışıyor — lütfen biraz sonra tekrar deneyin",
            "imported": 0,
            "linked": 0,
        }
    try:
        return import_inbox(db, limit=limit, unseen_only=unseen_only)
    finally:
        _sync_lock.release()


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
    print("[baykus] mail autosync: every 30 min when IMAP configured", flush=True)


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
