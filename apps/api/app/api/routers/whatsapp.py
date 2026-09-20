"""WhatsApp şablonları ve yerel gönderim günlüğü (gerçek API yok)."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.user import User
from app.models.whatsapp import WA_CATEGORIES, WhatsAppSendLog, WhatsAppTemplate
from app.schemas.whatsapp import (
    WhatsAppLogCreate,
    WhatsAppLogOut,
    WhatsAppPreviewOut,
    WhatsAppPreviewRequest,
    WhatsAppTemplateCreate,
    WhatsAppTemplateOut,
    WhatsAppTemplateUpdate,
)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


def _normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0") and len(digits) == 11:
        digits = "90" + digits[1:]
    return digits


def _render(body: str, placeholders: dict[str, str]) -> str:
    text = body
    for key, value in placeholders.items():
        text = text.replace("{" + key + "}", str(value))
        text = text.replace("{{" + key + "}}", str(value))
    return text


def _wa_link(phone: str, text: str) -> str:
    return f"https://wa.me/{_normalize_phone(phone)}?text={quote(text)}"


def _log_out(row: WhatsAppSendLog) -> WhatsAppLogOut:
    return WhatsAppLogOut(
        id=row.id,
        template_id=row.template_id,
        template_name=row.template.name if row.template else None,
        phone=row.phone,
        rendered_body=row.rendered_body,
        wa_link=row.wa_link,
        customer_name=row.customer_name,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
    )


@router.get("/categories")
def list_categories(_: User = Depends(require_roles("admin", "satış"))) -> list[str]:
    return list(WA_CATEGORIES)


@router.get("/templates", response_model=list[WhatsAppTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
) -> list[WhatsAppTemplateOut]:
    rows = db.query(WhatsAppTemplate).order_by(WhatsAppTemplate.id.asc()).all()
    return [WhatsAppTemplateOut.model_validate(r) for r in rows]


@router.post("/templates", response_model=WhatsAppTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: WhatsAppTemplateCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
) -> WhatsAppTemplateOut:
    if db.query(WhatsAppTemplate).filter(WhatsAppTemplate.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Şablon adı zaten var")
    row = WhatsAppTemplate(name=payload.name, category=payload.category, body=payload.body)
    db.add(row)
    db.commit()
    db.refresh(row)
    return WhatsAppTemplateOut.model_validate(row)


@router.put("/templates/{template_id}", response_model=WhatsAppTemplateOut)
def update_template(
    template_id: int,
    payload: WhatsAppTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
) -> WhatsAppTemplateOut:
    row = db.get(WhatsAppTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != row.name:
        if db.query(WhatsAppTemplate).filter(WhatsAppTemplate.name == data["name"]).first():
            raise HTTPException(status_code=400, detail="Şablon adı zaten var")
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return WhatsAppTemplateOut.model_validate(row)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    row = db.get(WhatsAppTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    db.delete(row)
    db.commit()


@router.post("/preview", response_model=WhatsAppPreviewOut)
def preview(
    payload: WhatsAppPreviewRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
) -> WhatsAppPreviewOut:
    body = payload.body
    if payload.template_id is not None:
        tpl = db.get(WhatsAppTemplate, payload.template_id)
        if not tpl:
            raise HTTPException(status_code=404, detail="Şablon bulunamadı")
        body = tpl.body
    if not body:
        raise HTTPException(status_code=400, detail="Metin veya şablon gerekli")
    rendered = _render(body, payload.placeholders or {})
    return WhatsAppPreviewOut(
        rendered_body=rendered,
        wa_link=_wa_link(payload.phone, rendered),
        phone=payload.phone,
    )


@router.post("/logs", response_model=WhatsAppLogOut, status_code=status.HTTP_201_CREATED)
def create_log(
    payload: WhatsAppLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> WhatsAppLogOut:
    if payload.template_id is not None and not db.get(WhatsAppTemplate, payload.template_id):
        raise HTTPException(status_code=400, detail="Şablon bulunamadı")
    row = WhatsAppSendLog(
        template_id=payload.template_id,
        phone=payload.phone,
        rendered_body=payload.rendered_body,
        wa_link=payload.wa_link,
        customer_name=payload.customer_name,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _log_out(row)


@router.get("/logs", response_model=list[WhatsAppLogOut])
def list_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
    limit: int = 50,
) -> list[WhatsAppLogOut]:
    rows = db.query(WhatsAppSendLog).order_by(WhatsAppSendLog.id.desc()).limit(limit).all()
    return [_log_out(r) for r in rows]



@router.get("/track")
def track_center(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış")),
) -> dict:
    """WhatsApp Takip Merkezi kuyrukları: hazır / ödeme / tasarım onayı."""
    from datetime import date as date_cls
    from app.models.order import Order

    today = date_cls.today()
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer))
        .filter(Order.status.notin_(["Teslim Edildi", "Sipariş İptali"]))
        .order_by(Order.id.desc())
        .limit(500)
        .all()
    )
    ready, pay_due, design = [], [], []
    for o in orders:
        item = {
            "id": o.id,
            "order_number": o.order_number,
            "customer_id": o.customer_id,
            "customer_name": o.customer.name if o.customer else None,
            "customer_phone": getattr(o.customer, "phone", None) if o.customer else None,
            "status": o.status,
            "design_status": o.design_status,
            "total_amount": float(o.total_amount or 0),
            "deposit_amount": float(o.deposit_amount or 0),
            "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
        }
        if o.status in ("Hazır", "Baskıda"):
            ready.append(item)
        paid = float(o.deposit_amount or 0)
        # rough remaining
        rem = float(o.total_amount or 0) - paid
        if rem > 0.01:
            pay_due.append({**item, "remaining": rem})
        if (o.design_status or "").lower() in ("bekliyor", "revizyon", "bekliyor"):
            design.append(item)
    return {
        "ready_orders": ready[:100],
        "payment_due": pay_due[:100],
        "design_approval": design[:100],
        "counts": {
            "ready": len(ready),
            "payment_due": len(pay_due),
            "design_approval": len(design),
        },
    }
