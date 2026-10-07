"""E-posta: SMTP gönder / IMAP senkron / yerel kutu."""

from __future__ import annotations

import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.mail import MailMessage
from app.models.settings_model import AppSetting
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.mail import (
    MailAccountIn,
    MailAccountOut,
    MailAccountsListOut,
    MailAccountTestIn,
    MailActionResult,
    MailAttachmentOut,
    MailMessageOut,
    MailMessageUpdate,
    MailSendRequest,
    MailSettingsOut,
    MailSettingsUpdate,
    MailSyncAccountResult,
    MailSyncStatusOut,
    MailUnreadAccountCount,
    MailUnreadPreview,
    MailUnreadSummaryOut,
)
from app.services.mail_accounts import (
    ACCOUNTS_PATH,
    MailAccount,
    create_account,
    delete_account,
    get_account,
    get_default_account,
    list_accounts,
    merged_test_config,
    public_account_dict,
    set_default_account,
    update_account,
)
from app.services.mail_sync import (
    build_eml_bytes,
    load_sync_state,
    parse_attachments_meta,
    resolve_attachment_path,
    run_manual_sync,
)
from app.services.mail_transport import send_email, test_imap, test_smtp

router = APIRouter(prefix="/mail", tags=["mail"])


def _parse_dt(raw: object) -> datetime | None:
    if isinstance(raw, str) and raw.strip():
        try:
            return datetime.fromisoformat(raw.replace("Z", ""))
        except Exception:  # noqa: BLE001
            return None
    return None


def _account_out(a: MailAccount) -> MailAccountOut:
    st = load_sync_state(a.id)
    return MailAccountOut(
        **public_account_dict(a),
        last_sync_at=_parse_dt(st.get("last_sync_at")),
        last_ok=st.get("last_ok"),
        last_message=str(st.get("last_message") or ""),
    )


def _account_names() -> dict[int, str]:
    return {a.id: a.display_name() for a in list_accounts()}


def _settings_out_for(a: MailAccount | None) -> MailSettingsOut:
    """Geriye dönük: /settings varsayılan hesabı tek hesap gibi döner."""
    if a is None:
        return MailSettingsOut(config_path=str(ACCOUNTS_PATH))
    d = public_account_dict(a)
    keep = set(MailSettingsOut.model_fields.keys())
    return MailSettingsOut(**{k: v for k, v in d.items() if k in keep}, config_path=str(ACCOUNTS_PATH))


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


def _out(
    row: MailMessage,
    db: Session | None = None,
    account_names: dict[int, str] | None = None,
) -> MailMessageOut:
    names = account_names if account_names is not None else _account_names()
    acc_id = getattr(row, "account_id", None)
    acc_name = None
    if acc_id is not None:
        acc_name = names.get(int(acc_id)) or f"Silinmiş hesap #{acc_id}"
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
        account_id=acc_id,
        account_name=acc_name,
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
    """Varsayılan hesabın durumu (geriye dönük uyumluluk)."""
    return _settings_out_for(get_default_account())


@router.put("/settings", response_model=MailSettingsOut)
def update_settings(
    payload: MailSettingsUpdate,
    _: User = Depends(require_roles("admin")),
) -> MailSettingsOut:
    """Geriye dönük: varsayılan hesabı günceller (yoksa oluşturur)."""
    data = payload.model_dump(exclude_unset=True)
    cur = get_default_account()
    acc = update_account(cur.id, data) if cur else create_account({**data, "is_default": True})
    return _settings_out_for(acc)


# ── Hesaplar ──────────────────────────────────────────────────────────────


@router.get("/accounts", response_model=MailAccountsListOut)
def list_mail_accounts(
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailAccountsListOut:
    accs = list_accounts()
    d = get_default_account()
    return MailAccountsListOut(
        accounts=[_account_out(a) for a in accs],
        default_account_id=d.id if d else None,
        storage_path=str(ACCOUNTS_PATH),
    )


@router.get("/settings/accounts", response_model=MailAccountsListOut)
def list_mail_accounts_admin(
    user: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailAccountsListOut:
    return list_mail_accounts(user)


@router.post("/settings/accounts", response_model=MailAccountOut, status_code=status.HTTP_201_CREATED)
def create_mail_account(
    payload: MailAccountIn,
    _: User = Depends(require_roles("admin")),
) -> MailAccountOut:
    acc = create_account(payload.model_dump(exclude_unset=True))
    return _account_out(acc)


@router.put("/settings/accounts/{account_id}", response_model=MailAccountOut)
def update_mail_account(
    account_id: int,
    payload: MailAccountIn,
    _: User = Depends(require_roles("admin")),
) -> MailAccountOut:
    acc = update_account(account_id, payload.model_dump(exclude_unset=True))
    if acc is None:
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    return _account_out(acc)


@router.delete("/settings/accounts/{account_id}", response_model=MailActionResult)
def delete_mail_account(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> MailActionResult:
    acc = get_account(account_id)
    if acc is None:
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    kept = db.query(MailMessage).filter(MailMessage.account_id == account_id).count()
    if not delete_account(account_id):
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    msg = f"{acc.display_name()} silindi"
    if kept:
        msg += f" — {kept} mesaj kutuda kalmaya devam ediyor (Tümü altında görünür)"
    return MailActionResult(ok=True, message=msg)


@router.post("/settings/accounts/{account_id}/default", response_model=MailAccountOut)
def make_default_mail_account(
    account_id: int,
    _: User = Depends(require_roles("admin")),
) -> MailAccountOut:
    acc = set_default_account(account_id)
    if acc is None:
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    return _account_out(acc)


def _test_cfg(payload: MailAccountTestIn | None) -> MailAccount:
    if payload is None:
        d = get_default_account()
        return d or MailAccount()
    data = payload.model_dump(exclude_unset=True)
    acc_id = data.pop("account_id", None)
    for k in ("label", "active", "is_default"):
        data.pop(k, None)
    return merged_test_config(acc_id, data)


@router.post("/settings/test-smtp", response_model=MailActionResult)
def api_test_smtp(
    payload: MailAccountTestIn = MailAccountTestIn(),
    _: User = Depends(require_roles("admin")),
) -> MailActionResult:
    r = test_smtp(_test_cfg(payload))
    return MailActionResult(ok=bool(r.get("ok")), message=str(r.get("message") or ""))


@router.post("/settings/test-imap", response_model=MailActionResult)
def api_test_imap(
    payload: MailAccountTestIn = MailAccountTestIn(),
    _: User = Depends(require_roles("admin")),
) -> MailActionResult:
    r = test_imap(_test_cfg(payload))
    return MailActionResult(ok=bool(r.get("ok")), message=str(r.get("message") or ""))



@router.get("/unread-summary", response_model=MailUnreadSummaryOut)
def unread_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailUnreadSummaryOut:
    """Hafif okunmamış özeti — ana sayfa / kenar çubuğu rozeti."""
    accounts = list_accounts()
    if not accounts:
        return MailUnreadSummaryOut(configured=False)

    names = {a.id: a.display_name() for a in accounts}
    active_ids = {a.id for a in accounts if a.active}

    count_rows = (
        db.query(MailMessage.account_id, func.count(MailMessage.id))
        .filter(MailMessage.folder == "inbox", MailMessage.is_read.is_(False))
        .group_by(MailMessage.account_id)
        .all()
    )
    by_acc: dict[int | None, int] = {aid: int(n) for aid, n in count_rows}

    breakdown: list[MailUnreadAccountCount] = []
    for a in accounts:
        if not a.active:
            continue
        n = by_acc.get(a.id, 0)
        breakdown.append(
            MailUnreadAccountCount(account_id=a.id, account_name=a.display_name(), unread=n)
        )
    # Orphan / silinmiş hesap mesajları
    for aid, n in by_acc.items():
        if aid is None or aid not in names:
            breakdown.append(
                MailUnreadAccountCount(
                    account_id=aid,
                    account_name=f"Silinmiş hesap #{aid}" if aid is not None else "Hesapsız",
                    unread=n,
                )
            )
    total = sum(x.unread for x in breakdown)

    latest_rows = (
        db.query(MailMessage)
        .filter(MailMessage.folder == "inbox", MailMessage.is_read.is_(False))
        .order_by(MailMessage.date_sent.desc(), MailMessage.id.desc())
        .limit(3)
        .all()
    )
    latest = [
        MailUnreadPreview(
            id=r.id,
            account_id=r.account_id,
            account_name=(
                names.get(int(r.account_id))
                if r.account_id is not None
                else None
            )
            or (f"Silinmiş hesap #{r.account_id}" if r.account_id is not None else None),
            from_addr=r.from_addr or "",
            subject=r.subject or "(konu yok)",
            date_sent=r.date_sent,
        )
        for r in latest_rows
    ]

    return MailUnreadSummaryOut(
        configured=True,
        total_unread=total,
        account_count=len(active_ids),
        accounts=breakdown,
        latest=latest,
    )


@router.get("/messages", response_model=list[MailMessageOut])
def list_messages(
    folder: str | None = Query(None, description="inbox | sent"),
    account_id: int | None = Query(None, description="boş = tüm hesaplar"),
    customer_id: int | None = None,
    q: str | None = None,
    limit: int = Query(80, ge=1, le=300),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> list[MailMessageOut]:
    qry = db.query(MailMessage)
    if folder in ("inbox", "sent"):
        qry = qry.filter(MailMessage.folder == folder)
    if account_id is not None:
        qry = qry.filter(MailMessage.account_id == account_id)
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
    names = _account_names()
    return [_out(r, db, names) for r in rows]


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

    account = get_account(payload.account_id) if payload.account_id else get_default_account()
    if account is None:
        raise HTTPException(
            status_code=400,
            detail="Gönderen hesap bulunamadı — Sistem › E-Posta Ayarları'ndan hesap ekleyin",
        )
    if not account.active:
        raise HTTPException(status_code=400, detail=f"{account.display_name()} pasif — önce aktif edin")

    result = send_email(
        to=payload.to,
        subject=payload.subject,
        body_text=payload.body,
        cc=payload.cc,
        cfg=account,
    )
    if not result.get("ok"):
        # still store failed attempt in sent with error
        row = MailMessage(
            account_id=account.id,
            folder="sent",
            direction="out",
            message_id=None,
            from_addr=account.effective_from(),
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
        account_id=account.id,
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
    account_id: int | None = Query(None, description="boş = tüm hesaplar"),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailSyncStatusOut:
    accs = list_accounts()
    st = load_sync_state(account_id)
    if account_id is not None:
        sel = [a for a in accs if a.id == account_id]
        imap_ok = bool(sel and sel[0].active and sel[0].imap_configured)
    else:
        imap_ok = any(a.active and a.imap_configured for a in accs)
    return MailSyncStatusOut(
        last_sync_at=_parse_dt(st.get("last_sync_at")),
        last_ok=st.get("last_ok"),
        last_message=str(st.get("last_message") or ""),
        imported=int(st.get("imported") or 0),
        linked=int(st.get("linked") or 0),
        skipped=bool(st.get("skipped")),
        imap_configured=imap_ok,
        autosync_interval_minutes=30,
        account_id=account_id,
        accounts=[_account_out(a) for a in accs],
    )


@router.post("/sync", response_model=MailActionResult)
def sync_inbox(
    account_id: int | None = Query(None, description="boş = tüm aktif hesaplar"),
    limit: int = Query(40, ge=1, le=100),
    unseen_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> MailActionResult:
    result = run_manual_sync(db, account_id=account_id, limit=limit, unseen_only=unseen_only)
    return MailActionResult(
        ok=bool(result.get("ok")),
        message=str(result.get("message") or ""),
        imported=int(result.get("imported") or 0),
        linked=int(result.get("linked") or 0),
        results=[
            MailSyncAccountResult(
                account_id=int(r.get("account_id") or 0),
                account=str(r.get("account") or ""),
                ok=bool(r.get("ok")),
                message=str(r.get("message") or ""),
                imported=int(r.get("imported") or 0),
                linked=int(r.get("linked") or 0),
                skipped=bool(r.get("skipped")),
            )
            for r in (result.get("results") or [])
        ],
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
