from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.order import (
    DEFAULT_ORDER_STATUS,
    ORDER_STATUSES,
    Order,
    OrderLine,
    OrderStatusHistory,
    Payment,
)
from app.models.user import User
from app.schemas.order import (
    KanbanBoard,
    KanbanCard,
    KanbanColumn,
    OrderCreate,
    OrderListItem,
    OrderOut,
    OrderStatusChange,
    OrderUpdate,
)

router = APIRouter(prefix="/orders", tags=["orders"])


def _dec(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _line_total(qty: int, unit_price: Decimal, discount_amount: Decimal) -> Decimal:
    raw = _dec(unit_price) * Decimal(qty)
    return max(raw - _dec(discount_amount), Decimal("0"))


def _paid_amount(order: Order) -> Decimal:
    return sum((_dec(p.amount) for p in order.payments), Decimal("0"))


def _remaining(order: Order) -> Decimal:
    paid = _paid_amount(order)
    # Deposit counts toward paid if no explicit payments yet
    effective_paid = paid if paid > 0 else _dec(order.deposit_amount)
    remaining = _dec(order.total_amount) - effective_paid
    return max(remaining, Decimal("0"))


def _customer_name(order: Order) -> str | None:
    if order.customer is not None:
        return order.customer.name
    return None


def _to_list_item(order: Order) -> OrderListItem:
    paid = _paid_amount(order)
    effective_paid = paid if paid > 0 else _dec(order.deposit_amount)
    return OrderListItem(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=_customer_name(order),
        status=order.status,
        total_amount=_dec(order.total_amount),
        deposit_amount=_dec(order.deposit_amount),
        paid_amount=effective_paid,
        remaining_amount=_remaining(order),
        due_date=order.due_date,
        delivery_date=getattr(order, "delivery_date", None),
        channel=getattr(order, "channel", None),
        design_status=getattr(order, "design_status", None),
        design_notes=getattr(order, "design_notes", None),
        notes=order.notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _to_out(order: Order) -> OrderOut:
    base = _to_list_item(order)
    return OrderOut(
        **base.model_dump(),
        discount_amount=_dec(order.discount_amount),
        lines=order.lines,
        payments=order.payments,
        status_history=order.status_history,
    )


def _recompute_total(order: Order) -> None:
    lines_sum = sum((_dec(line.line_total) for line in order.lines), Decimal("0"))
    order.total_amount = max(lines_sum - _dec(order.discount_amount), Decimal("0"))


def _replace_lines(order: Order, lines_payload: list) -> None:
    order.lines.clear()
    for item in lines_payload:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        discount_amount = _dec(data.get("discount_amount"))
        unit_price = _dec(data.get("unit_price"))
        qty = int(data.get("quantity") or 1)
        # If discount_rate given and discount_amount is 0, derive amount
        rate = _dec(data.get("discount_rate"))
        if rate > 0 and discount_amount == 0:
            discount_amount = (unit_price * Decimal(qty) * rate / Decimal("100")).quantize(Decimal("0.01"))
        line = OrderLine(
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
            line_total=_line_total(qty, unit_price, discount_amount),
        )
        order.lines.append(line)
    _recompute_total(order)


def _next_order_number(db: Session) -> str:
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


def _record_status(
    db: Session,
    order: Order,
    from_status: str | None,
    to_status: str,
    user: User | None,
    note: str | None = None,
) -> None:
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=from_status,
            to_status=to_status,
            note=note,
            changed_by_user_id=user.id if user else None,
        )
    )


def _load_order(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(
            joinedload(Order.lines),
            joinedload(Order.payments),
            joinedload(Order.status_history),
            joinedload(Order.customer),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    return order


@router.get("/statuses")
def list_statuses(
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> list[str]:
    return list(ORDER_STATUSES)


@router.get("/kanban", response_model=KanbanBoard)
def kanban_board(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> KanbanBoard:
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.payments))
        .order_by(Order.updated_at.desc())
        .all()
    )
    columns: list[KanbanColumn] = []
    for status_label in ORDER_STATUSES:
        items = [
            KanbanCard(
                id=o.id,
                order_number=o.order_number,
                customer_name=_customer_name(o),
                status=o.status,
                total_amount=float(o.total_amount or 0),
                remaining_amount=float(_remaining(o)),
                due_date=o.due_date,
                channel=getattr(o, "channel", None),
                design_status=getattr(o, "design_status", None),
            )
            for o in orders
            if o.status == status_label
        ]
        columns.append(KanbanColumn(key=status_label, label=status_label, items=items))
    return KanbanBoard(columns=columns)


@router.get("", response_model=list[OrderListItem])
def list_orders(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
) -> list[OrderListItem]:
    query = db.query(Order).options(joinedload(Order.customer), joinedload(Order.payments))
    if status_filter:
        if status_filter not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz durum filtresi")
        query = query.filter(Order.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.outerjoin(Customer).filter(
            (Order.order_number.ilike(like))
            | (Order.notes.ilike(like))
            | (Customer.name.ilike(like))
            | (Customer.company.ilike(like))
        )
    orders = query.order_by(Order.id.desc()).offset(skip).limit(limit).all()
    return [_to_list_item(o) for o in orders]


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> OrderOut:
    if payload.customer_id is not None and not db.get(Customer, payload.customer_id):
        raise HTTPException(status_code=400, detail="Müşteri bulunamadı")

    order_number = (payload.order_number or "").strip() or _next_order_number(db)
    if db.query(Order).filter(Order.order_number == order_number).first():
        raise HTTPException(status_code=400, detail="Sipariş numarası zaten kullanılıyor")

    order = Order(
        order_number=order_number,
        customer_id=payload.customer_id,
        status=payload.status or DEFAULT_ORDER_STATUS,
        notes=payload.notes,
        due_date=payload.due_date,
        delivery_date=getattr(payload, "delivery_date", None),
        channel=getattr(payload, "channel", None) or "mağaza",
        design_status=getattr(payload, "design_status", None) or "bekliyor",
        design_notes=getattr(payload, "design_notes", None),
        deposit_amount=_dec(payload.deposit_amount),
        discount_amount=_dec(payload.discount_amount),
        total_amount=Decimal("0"),
    )
    db.add(order)
    db.flush()
    _replace_lines(order, payload.lines)

    if order.deposit_amount and order.deposit_amount > 0:
        db.add(
            Payment(
                order_id=order.id,
                amount=order.deposit_amount,
                method="kapora",
                status="tamamlandi",
                notes="Kapora",
            )
        )

    _record_status(db, order, None, order.status, user, note="Sipariş oluşturuldu")
    db.commit()
    return _to_out(_load_order(db, order.id))


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> OrderOut:
    return _to_out(_load_order(db, order_id))


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> OrderOut:
    order = _load_order(db, order_id)
    data = payload.model_dump(exclude_unset=True)
    lines = data.pop("lines", None)
    new_status = data.pop("status", None)

    if "customer_id" in data and data["customer_id"] is not None:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(status_code=400, detail="Müşteri bulunamadı")

    if "order_number" in data and data["order_number"]:
        clash = (
            db.query(Order)
            .filter(Order.order_number == data["order_number"], Order.id != order.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Sipariş numarası zaten kullanılıyor")

    for key, value in data.items():
        setattr(order, key, value)

    if lines is not None:
        if len(lines) == 0:
            raise HTTPException(status_code=400, detail="En az bir satır gerekli")
        # lines came from model_dump — wrap as simple objects for _replace_lines
        class _Line:
            def __init__(self, d: dict):
                self._d = d
            def model_dump(self):
                return self._d
        _replace_lines(order, [_Line(l) for l in lines])
    elif "discount_amount" in data:
        _recompute_total(order)

    if new_status is not None and new_status != order.status:
        old = order.status
        order.status = new_status
        _record_status(db, order, old, new_status, user, note="Sipariş güncelleme")

    order.updated_at = datetime.utcnow()
    db.commit()
    return _to_out(_load_order(db, order.id))


@router.patch("/{order_id}/status", response_model=OrderOut)
def change_status(
    order_id: int,
    payload: OrderStatusChange,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış", "üretim")),
) -> OrderOut:
    order = _load_order(db, order_id)
    if payload.status == order.status:
        return _to_out(order)
    # Soft cancel validation: allow cancel from any non-delivered; allow reopen from cancel
    if order.status == "Teslim Edildi" and payload.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz durum geçişi")
    old = order.status
    order.status = payload.status
    order.updated_at = datetime.utcnow()
    _record_status(db, order, old, payload.status, user, note=payload.note)
    db.commit()
    return _to_out(_load_order(db, order.id))


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    order_id: int,
    soft: bool = Query(default=True, description="True: Sipariş İptali; False: hard delete"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> None:
    order = _load_order(db, order_id)
    if soft:
        if order.status != "Sipariş İptali":
            old = order.status
            order.status = "Sipariş İptali"
            order.updated_at = datetime.utcnow()
            _record_status(db, order, old, "Sipariş İptali", user, note="Soft cancel")
            db.commit()
        return
    # Hard delete only for admin
    role_names = {r.name for r in user.roles}
    if "admin" not in role_names:
        raise HTTPException(status_code=403, detail="Kalıcı silme yalnızca admin")
    db.delete(order)
    db.commit()


@router.get("/{order_id}/work-order-pdf")
def work_order_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
):
    from fastapi.responses import Response
    from app.models.settings_model import AppSetting
    from app.services.pdf import build_work_order_pdf

    order = _load_order(db, order_id)
    rows = {s.key: s.value for s in db.query(AppSetting).all()}
    settings = {
        "company_name": rows.get("company_name", "Baykuş Baskı"),
        "phone": rows.get("phone", ""),
    }
    pdf_bytes = build_work_order_pdf(order, settings)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{order.order_number}-is-emri.pdf"'},
    )
