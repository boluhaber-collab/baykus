"""Teklifler — CRUD, soft cancel, siparişe dönüştür, PDF."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.order import DEFAULT_ORDER_STATUS, Order, OrderLine, OrderStatusHistory
from app.models.quote import DEFAULT_QUOTE_STATUS, QUOTE_STATUSES, Quote, QuoteLine
from app.models.settings_model import AppSetting
from app.models.user import User
from app.schemas.quote import (
    QuoteConvertOut,
    QuoteCreate,
    QuoteListItem,
    QuoteOut,
    QuoteUpdate,
)
from app.services.audit import write_audit
from app.services.pdf import build_quote_pdf

router = APIRouter(prefix="/quotes", tags=["quotes"])


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def _calc_line(qty: int, unit_price: Decimal, discount_amount: Decimal) -> Decimal:
    return max(_d(unit_price) * Decimal(qty) - _d(discount_amount), Decimal("0"))


def _customer_name(q: Quote) -> str | None:
    return q.customer.name if q.customer is not None else None


def to_list_item(q: Quote) -> QuoteListItem:
    return QuoteListItem(
        id=q.id,
        quote_number=q.quote_number,
        customer_id=q.customer_id,
        customer_name=_customer_name(q),
        status=q.status,
        total_amount=_d(q.total_amount),
        discount_amount=_d(q.discount_amount),
        valid_until=q.valid_until,
        notes=q.notes,
        converted_order_id=q.converted_order_id,
        is_cancelled=bool(q.is_cancelled),
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


def to_out(q: Quote) -> QuoteOut:
    return QuoteOut(**to_list_item(q).model_dump(), lines=q.lines)


def recompute(q: Quote) -> None:
    total = sum((_d(line.line_total) for line in q.lines), Decimal("0"))
    q.total_amount = max(total - _d(q.discount_amount), Decimal("0"))


def replace_lines(q: Quote, lines_payload: list) -> None:
    q.lines.clear()
    for item in lines_payload:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        unit_price = _d(data.get("unit_price"))
        qty = int(data.get("quantity") or 1)
        discount_amount = _d(data.get("discount_amount"))
        rate = _d(data.get("discount_rate"))
        if rate > 0 and discount_amount == 0:
            discount_amount = (unit_price * Decimal(qty) * rate / Decimal("100")).quantize(Decimal("0.01"))
        q.lines.append(
            QuoteLine(
                product_id=data.get("product_id"),
                variant_id=data.get("variant_id"),
                description=data["description"],
                quantity=qty,
                size=data.get("size"),
                color=data.get("color"),
                print_type=data.get("print_type"),
                unit_price=unit_price,
                discount_rate=rate,
                discount_amount=discount_amount,
                line_total=_calc_line(qty, unit_price, discount_amount),
            )
        )
    recompute(q)


def next_quote_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"TKL-{year}-"
    last = (
        db.query(Quote)
        .filter(Quote.quote_number.like(f"{prefix}%"))
        .order_by(Quote.quote_number.desc())
        .first()
    )
    if last:
        try:
            seq = int(last.quote_number.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = db.query(Quote).count() + 1
    else:
        seq = 1
    return f"{prefix}{seq:03d}"


def next_order_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"SIP-{year}-"
    last = (
        db.query(Order)
        .filter(Order.order_number.like(f"{prefix}%"))
        .order_by(Order.order_number.desc())
        .first()
    )
    if last:
        try:
            seq = int(last.order_number.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = db.query(Order).count() + 1
    else:
        seq = 1
    return f"{prefix}{seq:03d}"


def load_quote(db: Session, quote_id: int) -> Quote:
    q = (
        db.query(Quote)
        .options(joinedload(Quote.lines), joinedload(Quote.customer))
        .filter(Quote.id == quote_id)
        .first()
    )
    if not q:
        raise HTTPException(status_code=404, detail="Teklif bulunamadı")
    return q


def company_settings(db: Session) -> dict[str, str]:
    rows = {s.key: s.value for s in db.query(AppSetting).all()}
    return {
        "company_name": rows.get("company_name", "Baykuş Baskı"),
        "phone": rows.get("phone", ""),
        "theme_label": rows.get("theme_label", "Varsayılan"),
    }


@router.get("/statuses")
def list_statuses(_: User = Depends(require_roles("admin", "satış"))) -> list[str]:
    return list(QUOTE_STATUSES)


@router.get("", response_model=list[QuoteListItem])
def list_quotes(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
    status_filter: str | None = Query(default=None, alias="status"),
    customer_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
) -> list[QuoteListItem]:
    query = db.query(Quote).options(joinedload(Quote.customer))
    if customer_id is not None:
        query = query.filter(Quote.customer_id == customer_id)
    if status_filter:
        if status_filter not in QUOTE_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz durum filtresi")
        query = query.filter(Quote.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.outerjoin(Customer).filter(
            (Quote.quote_number.ilike(like))
            | (Quote.notes.ilike(like))
            | (Customer.name.ilike(like))
            | (Customer.company.ilike(like))
        )
    items = query.order_by(Quote.id.desc()).offset(skip).limit(limit).all()
    return [to_list_item(i) for i in items]


@router.post("", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
def create_quote(
    payload: QuoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> QuoteOut:
    if payload.customer_id is not None and not db.get(Customer, payload.customer_id):
        raise HTTPException(status_code=400, detail="Müşteri bulunamadı")
    number = (payload.quote_number or "").strip() or next_quote_number(db)
    if db.query(Quote).filter(Quote.quote_number == number).first():
        raise HTTPException(status_code=400, detail="Teklif numarası zaten kullanılıyor")
    quote = Quote(
        quote_number=number,
        customer_id=payload.customer_id,
        status=payload.status or DEFAULT_QUOTE_STATUS,
        notes=payload.notes,
        valid_until=payload.valid_until,
        discount_amount=_d(payload.discount_amount),
        total_amount=Decimal("0"),
    )
    db.add(quote)
    db.flush()
    replace_lines(quote, payload.lines)
    db.commit()
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="quote",
        entity_id=quote.id,
        detail={"quote_number": quote.quote_number},
    )
    return to_out(load_quote(db, quote.id))


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> QuoteOut:
    return to_out(load_quote(db, quote_id))


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(
    quote_id: int,
    payload: QuoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> QuoteOut:
    quote = load_quote(db, quote_id)
    if quote.is_cancelled or quote.status == "Siparişe Dönüştü":
        raise HTTPException(status_code=400, detail="Bu teklif düzenlenemez")
    data = payload.model_dump(exclude_unset=True)
    lines = data.pop("lines", None)
    if "customer_id" in data and data["customer_id"] is not None:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(status_code=400, detail="Müşteri bulunamadı")
    if "quote_number" in data and data["quote_number"]:
        clash = (
            db.query(Quote)
            .filter(Quote.quote_number == data["quote_number"], Quote.id != quote.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Teklif numarası zaten kullanılıyor")
    for key, value in data.items():
        setattr(quote, key, value)
    if lines is not None:
        if len(lines) == 0:
            raise HTTPException(status_code=400, detail="En az bir satır gerekli")

        class Wrap:
            def __init__(self, d: dict):
                self._d = d

            def model_dump(self):
                return self._d

        replace_lines(quote, [Wrap(x) for x in lines])
    elif "discount_amount" in data:
        recompute(quote)
    quote.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="quote",
        entity_id=quote.id,
        detail={"quote_number": quote.quote_number},
    )
    return to_out(load_quote(db, quote.id))


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def soft_cancel_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> None:
    quote = load_quote(db, quote_id)
    if quote.status == "Siparişe Dönüştü":
        raise HTTPException(status_code=400, detail="Siparişe dönüşmüş teklif iptal edilemez")
    quote.is_cancelled = True
    quote.status = "Reddedildi"
    quote.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="quote",
        entity_id=quote.id,
        detail={"soft": True, "quote_number": quote.quote_number},
    )


@router.post("/{quote_id}/convert", response_model=QuoteConvertOut)
def convert_to_order(
    quote_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> QuoteConvertOut:
    quote = load_quote(db, quote_id)
    if quote.is_cancelled:
        raise HTTPException(status_code=400, detail="İptal edilmiş teklif dönüştürülemez")
    if quote.converted_order_id or quote.status == "Siparişe Dönüştü":
        raise HTTPException(status_code=400, detail="Teklif zaten siparişe dönüşmüş")
    if not quote.lines:
        raise HTTPException(status_code=400, detail="Teklifte satır yok")

    order_number = next_order_number(db)
    order = Order(
        order_number=order_number,
        customer_id=quote.customer_id,
        status=DEFAULT_ORDER_STATUS,
        notes=f"Tekliften dönüştürüldü: {quote.quote_number}"
        + (f"\n{quote.notes}" if quote.notes else ""),
        due_date=quote.valid_until,
        delivery_date=quote.valid_until,
        discount_amount=_d(quote.discount_amount),
        total_amount=Decimal("0"),
        channel="mağaza",
        design_status="Bekliyor",
    )
    db.add(order)
    db.flush()
    for ql in quote.lines:
        order.lines.append(
            OrderLine(
                product_id=ql.product_id,
                variant_id=ql.variant_id,
                description=ql.description,
                quantity=ql.quantity,
                size=ql.size,
                color=ql.color,
                print_type=ql.print_type,
                unit_price=_d(ql.unit_price),
                discount_rate=_d(ql.discount_rate),
                discount_amount=_d(ql.discount_amount),
                line_total=_d(ql.line_total),
            )
        )
    lines_sum = sum((_d(l.line_total) for l in order.lines), Decimal("0"))
    order.total_amount = max(lines_sum - _d(order.discount_amount), Decimal("0"))
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status=order.status,
            note=f"Teklif {quote.quote_number} dönüşümü",
            changed_by_user_id=user.id,
        )
    )
    quote.converted_order_id = order.id
    quote.status = "Siparişe Dönüştü"
    quote.updated_at = datetime.utcnow()
    db.commit()
    return QuoteConvertOut(
        quote=to_out(load_quote(db, quote_id)),
        order_id=order.id,
        order_number=order_number,
    )


@router.get("/{quote_id}/pdf")
def quote_pdf(
    quote_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> Response:
    quote = load_quote(db, quote_id)
    pdf_bytes = build_quote_pdf(quote, company_settings(db))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{quote.quote_number}.pdf"'},
    )
