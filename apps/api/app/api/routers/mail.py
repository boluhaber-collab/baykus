"""E-posta: SMTP gönder / IMAP senkron / yerel kutu."""

from __future__ import annotations

import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.mail import MailMessage
from app.models.settings_model import AppSetting
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.mail import (
    MailActionResult,
    MailAttachmentOut,
    MailMessageOut,
    MailMessageUpdate,
    MailSendRequest,
    MailSettingsOut,
    MailSettingsUpdate,
    MailSyncStatusOut,
)
from app.services.mail_config import MASK, MailConfig, load_mail_config, public_settings_dict, save_mail_config
from app.services.mail_sync import (
    build_eml_bytes,
    load_sync_state,
    parse_attachments_meta,
    resolve_attachment_path,
    run_manual_sync,
)
from app.services.mail_transport import send_email, test_imap, test_smtp

router = APIRouter(prefix="/mail", tags=["mail"])


def _cfg_from_test_payload(payload: MailSettingsUpdate | None) -> MailConfig:
    """Merge optional test body with saved mail_config; blank passwords keep saved."""
    cur = load_mail_config()
    if payload is None:
        return cur
    data = payload.model_dump(exclude_unset=True)
    data.pop("clear_smtp_password", None)
    data.pop("clear_imap_password", None)

    def take_str(key: str, attr: str) -> str:
        if key not in data or data[key] is None:
            return getattr(cur, attr)
        return str(data[key]).strip()

    def take_int(key: str, attr: str, default: int) -> int:
        if key not in data or data[key] is None:
            return int(getattr(cur, attr) or default)
        try:
            return int(data[key])
        except Exception:
            return int(getattr(cur, attr) or default)

    def take_bool(key: str, attr: str) -> bool:
        if key not in data or data[key] is None:
            return bool(getattr(cur, attr))
        return bool(data[key])

    smtp_pw = cur.smtp_password
    if "smtp_password" in data and data["smtp_password"] is not None:
        pw = str(data["smtp_password"])
        if pw and pw != MASK:
            smtp_pw = pw
    imap_pw = cur.imap_password
    if "imap_password" in data and data["imap_password"] is not None:
        pw = str(data["imap_password"])
        if pw and pw != MASK:
            imap_pw = pw

    return MailConfig(
        smtp_host=take_str("smtp_host", "smtp_host"),
        smtp_port=take_int("smtp_port", "smtp_port", 587),
        smtp_user=take_str("smtp_user", "smtp_user"),
        smtp_password=smtp_pw,
        smtp_use_tls=take_bool("smtp_use_tls", "smtp_use_tls"),
        from_name=take_str("from_name", "from_name") or "Baykuş Baskı",
        from_email=take_str("from_email", "from_email"),
        imap_host=take_str("imap_host", "imap_host"),
        imap_port=take_int("imap_port", "imap_port", 993),
        imap_user=take_str("imap_user", "imap_user"),
        imap_password=imap_pw,
        imap_use_ssl=take_bool("imap_use_ssl", "imap_use_ssl"),
        imap_folder=take_str("imap_folder", "imap_folder") or "INBOX",
    )




def _email_from_addr(raw: str) -> str:
    """Extract bare email from 'Name <a@b.com>' or bare address."""
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


def _out(row: MailMessage, db: Session | None = None) -> MailMessageOut:
    name = None
    if row.customer_id and db is not None:
        c = db.query(Customer).filter(Customer.id == row.customer_id).first()
        if c:
            name = (c.company or "").strip() or c.name
    atts = [
        MailAttachmentOut(
            filename=str(a.get("filename") or a.get("stored_name") or "ek"),
            content_type=str(a.get("content_type") or "application/octet-stream"),
            size=int(a.get("size") or 0),
            stored_name=str(a.get("stored_name") or ""),
        )
        for a in parse_attachments_meta(getattr(row, "attachments_json", None))
        if a.get("stored_name")
    ]
    return MailMessageOut(
        id=row.id,
        folder=row.folder,
        direction=row.direction,
        message_id=row.message_id,
        from_addr=row.from_addr,
        to_addrs=row.to_addrs,
        cc_addrs=row.cc_addrs,
        subject=row.subject,
        body_text=row.body_text or "",
        body_html=row.body_html,
        date_sent=row.date_sent,
        is_read=bool(row.is_read),
        customer_id=row.customer_id,
        supplier_id=row.supplier_id,
        customer_name=name,
        error=row.error,
        created_at=row.created_at,
        attachments=atts,
    )


def _settings_map(db: Session) -> dict[str, str]:
    return {s.key: (s.value or "") for s in db.query(AppSetting).all()}


def _safe_download_name(name: str, fallback: str) -> str:
    raw = (name or fallback or "dosya").strip() or fallback
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", raw)
    return cleaned[:120] or fallback


@router.get("/settings", response_model=MailSettingsOut)
def get_settings(_: User = Depends(require_roles("admin", "satış", "muhasebe"))) -> MailSettingsOut:
    return MailSettingsOut(**public_settings_dict())


@router.put("/settings", response_model=MailSettingsOut)
def update_settings(
    payload: MailSettingsUpdate,
    user: User = Depends(require_roles("admin")),
) -> MailSettingsOut:
    void = user  # admin-only write
    del void
    cur = load_mail_config()
    data = payload.model_dump(exclude_unset=True)
    clear_smtp = bool(data.pop("clear_smtp_password", False))
    clear_imap = bool(data.pop("clear_imap_password", False))

    def take(key: str, attr: str, cast=None):
        if key not in data or data[key] is None:
            return getattr(cur, attr)
        val = data[key]
        return cast(val) if cast else val

    cfg = MailConfig(
        smtp_host=take("smtp_host", "smtp_host", lambda v: str(v).strip()),
        smtp_port=take("smtp_port", "smtp_port", int),
        smtp_user=take("smtp_user", "smtp_user", lambda v: str(v).strip()),
        smtp_password=data.get("smtp_password") if "smtp_password" in data else cur.smtp_password,
        smtp_use_tls=take("smtp_use_tls", "smtp_use_tls", bool),
        from_name=take("from_name", "from_name", lambda v: str(v).strip()),
        from_email=take("from_email", "from_email", lambda v: str(v).strip()),
        imap_host=take("imap_host", "imap_host", lambda v: str(v).strip()),
        imap_port=take("imap_port", "imap_port", int),
        imap_user=take("imap_user", "imap_user", lambda v: str(v).strip()),
        imap_password=data.get("imap_password") if "imap_password" in data else cur.imap_password,
        imap_use_ssl=take("imap_use_ssl", "imap_use_ssl", bool),
        imap_folder=take("imap_folder", "imap_folder", lambda v: str(v).strip() or "INBOX"),
    )
    # If password is mask, treat as unset
    if cfg.smtp_password == MASK:
        cfg.smtp_password = cur.smtp_password
    if cfg.imap_password == MASK:
        cfg.imap_password = cur.imap_password

    merged = save_mail_config(cfg, clear_smtp_password=clear_smtp, clear_imap_password=clear_imap)
    return MailSettingsOut(**public_settings_dict(merged))


@router.post("/settings/test-smtp", response_model=MailActionResult)
def api_test_smtp(
    payload: MailSettingsUpdate = MailSettingsUpdate(),
    _: User = Depends(require_roles("admin")),
) -> MailActionResult:
    cfg = _cfg_from_test_payload(payload)
    r = test_smtp(cfg)
    return MailActionResult(ok=bool(r.get("ok")), message=str(r.get("message") or ""))


@router.post("/settings/test-imap", response_model=MailActionResult)
def api_test_imap(
    payload: MailSettingsUpdate = MailSettingsUpdate(),
    _: User = Depends(require_roles("admin")),
) -> MailActionResult:
    cfg = _cfg_from_test_payload(payload)
    r = test_imap(cfg)
    return MailActionResult(ok=bool(r.get("ok")), message=str(r.get("message") or ""))


@router.get("/messages", response_model=list[MailMessageOut])
def list_messages(
    folder: str | None = Query(None, description="inbox | sent"),
    customer_id: int | None = None,
    q: str | None = None,
    limit: int = Query(80, ge=1, le=300),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> list[MailMessageOut]:
    qry = db.query(MailMessage)
    if folder in ("inbox", "sent"):
        qry = qry.filter(MailMessage.folder == folder)
    if customer_id:
        qry = qry.filter(MailMessage.customer_id == customer_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(
            (MailMessage.subject.ilike(like))
            | (MailMessage.from_addr.ilike(like))
            | (MailMessage.to_addrs.ilike(like))
            | (MailMessage.body_text.ilike(like))
        )
    rows = (
        qry.order_by(MailMessage.date_sent.desc(), MailMessage.id.desc())
        .limit(limit)
        .all()
    )
    return [_out(r, db) for r in rows]


@router.get("/messages/{message_id}", response_model=MailMessageOut)
def get_message(
    message_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailMessageOut:
    row = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    if not row.is_read:
        row.is_read = True
        db.commit()
        db.refresh(row)
    return _out(row, db)


@router.patch("/messages/{message_id}", response_model=MailMessageOut)
def patch_message(
    message_id: int,
    payload: MailMessageUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailMessageOut:
    row = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "is_read" in data and data["is_read"] is not None:
        row.is_read = bool(data["is_read"])
    if "customer_id" in data:
        row.customer_id = data["customer_id"]
    db.commit()
    db.refresh(row)
    return _out(row, db)


@router.post("/send", response_model=MailMessageOut, status_code=status.HTTP_201_CREATED)
def send_mail(
    payload: MailSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailMessageOut:
    if payload.customer_id:
        cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if not cust:
            raise HTTPException(status_code=400, detail="Müşteri bulunamadı")
    if payload.supplier_id:
        sup = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not sup:
            raise HTTPException(status_code=400, detail="Tedarikçi bulunamadı")

    result = send_email(
        to=payload.to,
        subject=payload.subject,
        body_text=payload.body,
        cc=payload.cc,
    )
    if not result.get("ok"):
        # still store failed attempt in sent with error
        row = MailMessage(
            folder="sent",
            direction="out",
            message_id=None,
            from_addr=load_mail_config().effective_from(),
            to_addrs=payload.to,
            cc_addrs=payload.cc,
            subject=payload.subject or "(konu yok)",
            body_text=payload.body or "",
            date_sent=datetime.utcnow(),
            is_read=True,
            customer_id=payload.customer_id,
            supplier_id=payload.supplier_id,
            created_by_user_id=user.id,
            error=str(result.get("message") or "Gönderilemedi"),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        raise HTTPException(status_code=400, detail=result.get("message") or "Gönderilemedi")

    row = MailMessage(
        folder="sent",
        direction="out",
        message_id=result.get("message_id"),
        from_addr=str(result.get("from_addr") or ""),
        to_addrs=str(result.get("to_addrs") or payload.to),
        cc_addrs=result.get("cc_addrs") or payload.cc,
        subject=str(result.get("subject") or payload.subject or "(konu yok)"),
        body_text=str(result.get("body_text") or payload.body or ""),
        date_sent=result.get("date_sent") or datetime.utcnow(),
        is_read=True,
        customer_id=payload.customer_id,
        supplier_id=payload.supplier_id,
        created_by_user_id=user.id,
        error=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row, db)


@router.get("/sync-status", response_model=MailSyncStatusOut)
def sync_status(
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailSyncStatusOut:
    st = load_sync_state()
    last_at = st.get("last_sync_at")
    parsed_at: datetime | None = None
    if isinstance(last_at, str) and last_at.strip():
        try:
            parsed_at = datetime.fromisoformat(last_at.replace("Z", ""))
        except Exception:
            parsed_at = None
    cfg = load_mail_config()
    return MailSyncStatusOut(
        last_sync_at=parsed_at,
        last_ok=st.get("last_ok"),
        last_message=str(st.get("last_message") or ""),
        imported=int(st.get("imported") or 0),
        linked=int(st.get("linked") or 0),
        skipped=bool(st.get("skipped")),
        imap_configured=bool(cfg.imap_configured),
        autosync_interval_minutes=30,
    )


@router.post("/sync", response_model=MailActionResult)
def sync_inbox(
    limit: int = Query(40, ge=1, le=100),
    unseen_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailActionResult:
    result = run_manual_sync(db, limit=limit, unseen_only=unseen_only)
    return MailActionResult(
        ok=bool(result.get("ok")),
        message=str(result.get("message") or ""),
        imported=int(result.get("imported") or 0),
        linked=int(result.get("linked") or 0),
    )


@router.get("/messages/{message_id}/pdf")
def message_pdf(
    message_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> Response:
    row = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    from app.services.pdf import build_mail_message_pdf

    meta = parse_attachments_meta(getattr(row, "attachments_json", None))
    pdf = build_mail_message_pdf(
        subject=row.subject or "(konu yok)",
        from_addr=row.from_addr or "",
        to_addrs=row.to_addrs or "",
        cc_addrs=row.cc_addrs,
        date_sent=row.date_sent,
        body_text=row.body_text or "",
        folder=row.folder or "inbox",
        settings=_settings_map(db),
        attachment_names=[str(a.get("filename") or "") for a in meta if a.get("filename")],
    )
    fname = _safe_download_name(row.subject or f"mail-{row.id}", f"mail-{row.id}") + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/messages/{message_id}/eml")
def message_eml(
    message_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> Response:
    row = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    raw = build_eml_bytes(row)
    fname = _safe_download_name(row.subject or f"mail-{row.id}", f"mail-{row.id}") + ".eml"
    return Response(
        content=raw,
        media_type="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/messages/{message_id}/attachments/{stored_name}")
def download_attachment(
    message_id: int,
    stored_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> Response:
    row = db.query(MailMessage).filter(MailMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    meta = parse_attachments_meta(getattr(row, "attachments_json", None))
    match = next((a for a in meta if str(a.get("stored_name") or "") == stored_name), None)
    if not match:
        raise HTTPException(status_code=404, detail="Ek bulunamadı")
    path = resolve_attachment_path(message_id, stored_name)
    if path is None:
        raise HTTPException(status_code=404, detail="Ek dosyası bulunamadı")
    data = path.read_bytes()
    fname = _safe_download_name(str(match.get("filename") or stored_name), stored_name)
    ctype = str(match.get("content_type") or "application/octet-stream")
    return Response(
        content=data,
        media_type=ctype,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
