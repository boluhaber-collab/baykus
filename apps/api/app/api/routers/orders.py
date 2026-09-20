from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.order import (
    DEFAULT_ORDER_STATUS,
    ORDER_STATUSES,
    DESIGN_STATUSES,
    ORDER_CHANNELS,
    Order,
    OrderDesignFile,
    OrderLine,
    OrderStatusHistory,
    Payment,
)
from app.models.user import User
from app.schemas.design_file import OrderDesignFileOut
from app.services.audit import write_audit
from app.services import design_files as design_store
from app.schemas.order import (
    KanbanBoard,
    KanbanCard,
    KanbanColumn,
    OrderCreate,
    OrderListItem,
    OrderOut,
    OrderStatusChange,
    OrderUpdate,
    PaymentCreate,
    PaymentOut,
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


@router.get("/channels")
def list_channels(
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> list[str]:
    return list(ORDER_CHANNELS)


@router.get("/design-statuses")
def list_design_statuses(
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> list[str]:
    return list(DESIGN_STATUSES)


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
    channel: str | None = Query(default=None),
    design_status: str | None = Query(default=None),
    delivery: str | None = Query(
        default=None,
        description="today|overdue|due|upcoming — filters by delivery_date or due_date",
    ),
    channels: str | None = Query(
        default=None,
        description="Comma-separated channels (e.g. mağaza,perakende)",
    ),
    q: str | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
) -> list[OrderListItem]:
    query = db.query(Order).options(joinedload(Order.customer), joinedload(Order.payments))
    if status_filter:
        if status_filter not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz durum filtresi")
        query = query.filter(Order.status == status_filter)
    if channel:
        if channel not in ORDER_CHANNELS:
            raise HTTPException(status_code=400, detail="Geçersiz kanal filtresi")
        query = query.filter(Order.channel == channel)
    if channels:
        ch_list = [c.strip() for c in channels.split(",") if c.strip()]
        bad = [c for c in ch_list if c not in ORDER_CHANNELS]
        if bad:
            raise HTTPException(status_code=400, detail=f"Geçersiz kanal: {', '.join(bad)}")
        query = query.filter(Order.channel.in_(ch_list))
    if design_status:
        if design_status not in DESIGN_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz tasarım durumu")
        query = query.filter(Order.design_status == design_status)
    if delivery:
        today = date.today()
        # Prefer delivery_date, fall back to due_date in Python filter after fetch for SQLite safety
        candidates = query.order_by(Order.id.desc()).all()
        filtered: list[Order] = []
        for o in candidates:
            d = o.delivery_date or o.due_date
            if d is None:
                continue
            if delivery == "today" and d == today:
                filtered.append(o)
            elif delivery == "overdue" and d < today and o.status not in ("Teslim Edildi", "Sipariş İptali"):
                filtered.append(o)
            elif delivery == "due" and d >= today and o.status not in ("Teslim Edildi", "Sipariş İptali"):
                filtered.append(o)
            elif delivery == "upcoming" and today <= d <= (today + timedelta(days=7)) and o.status not in ("Teslim Edildi", "Sipariş İptali"):
                filtered.append(o)
            elif delivery == "all" and d is not None:
                filtered.append(o)
        return [_to_list_item(o) for o in filtered[skip : skip + limit]]
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
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="order",
        entity_id=order.id,
        detail={"order_number": order.order_number},
    )
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
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="order",
        entity_id=order.id,
        detail={"order_number": order.order_number},
    )
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
            write_audit(
                user_id=user.id,
                action="delete",
                entity_type="order",
                entity_id=order.id,
                detail={"soft": True, "order_number": order.order_number},
            )
        return
    # Hard delete only for admin
    role_names = {r.name for r in user.roles}
    if "admin" not in role_names:
        raise HTTPException(status_code=403, detail="Kalıcı silme yalnızca admin")
    number = order.order_number
    db.delete(order)
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="order",
        entity_id=order_id,
        detail={"soft": False, "order_number": number},
    )




@router.get("/{order_id}/timeline")
def order_timeline(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> dict:
    """Status history + payments + design file events for yaşam çizgisi."""
    order = _load_order(db, order_id)
    events: list[dict] = []
    events.append(
        {
            "type": "created",
            "at": order.created_at.isoformat() if order.created_at else None,
            "label": "Sipariş oluşturuldu",
            "detail": order.order_number,
        }
    )
    for h in order.status_history or []:
        events.append(
            {
                "type": "status",
                "at": h.created_at.isoformat() if h.created_at else None,
                "label": f"{h.from_status or '—'} → {h.to_status}",
                "detail": h.note,
                "from_status": h.from_status,
                "to_status": h.to_status,
            }
        )
    for p in order.payments or []:
        events.append(
            {
                "type": "payment",
                "at": p.paid_at.isoformat() if p.paid_at else None,
                "label": f"Ödeme {p.amount} ({p.method})",
                "detail": p.notes,
                "amount": float(p.amount or 0),
                "method": p.method,
            }
        )
    files = (
        db.query(OrderDesignFile)
        .filter(OrderDesignFile.order_id == order_id)
        .order_by(OrderDesignFile.id.asc())
        .all()
    )
    for f in files:
        events.append(
            {
                "type": "design",
                "at": f.created_at.isoformat() if getattr(f, "created_at", None) else None,
                "label": f"Tasarım: {f.original_filename}",
                "detail": f.content_type,
                "file_id": f.id,
            }
        )
    if order.design_status:
        events.append(
            {
                "type": "design_status",
                "at": order.updated_at.isoformat() if order.updated_at else None,
                "label": f"Tasarım durumu: {order.design_status}",
                "detail": order.design_notes,
            }
        )
    events.sort(key=lambda e: e.get("at") or "")
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "events": events,
    }

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





@router.post("/{order_id}/payments", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    order_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> OrderOut:
    order = _load_order(db, order_id)
    amount = _dec(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Tutar 0 dan büyük olmalı")

    payment = Payment(
        order_id=order.id,
        amount=amount,
        method=payload.method or "nakit",
        status="tamamlandi",
        paid_at=payload.paid_at or datetime.utcnow(),
        notes=payload.notes,
    )
    db.add(payment)
    db.flush()

    if payload.post_to_cari and order.customer_id:
        from app.models.customer import CariMovement

        db.add(
            CariMovement(
                customer_id=order.customer_id,
                movement_type="payment",
                debit=Decimal("0"),
                credit=amount,
                movement_date=(payload.paid_at or datetime.utcnow()).date(),
                order_id=order.id,
                note=payload.notes or f"Sipariş tahsilatı {order.order_number}",
            )
        )

    if payload.post_to_finance and payload.finance_method:
        from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister

        note = payload.notes or f"Sipariş tahsilatı {order.order_number}"
        mov_date = (payload.paid_at or datetime.utcnow()).date()
        if payload.finance_method == "cash":
            reg = (
                db.query(CashRegister)
                .filter(CashRegister.is_active.is_(True))
                .order_by(CashRegister.id.asc())
                .first()
            )
            if reg:
                db.add(
                    CashMovement(
                        cash_register_id=reg.id,
                        movement_type="tahsilat",
                        amount=amount,
                        movement_date=mov_date,
                        note=note,
                        customer_id=order.customer_id,
                    )
                )
        elif payload.finance_method == "bank":
            if not payload.bank_account_id:
                raise HTTPException(status_code=400, detail="Banka hesabı seçilmedi")
            acc = db.get(BankAccount, payload.bank_account_id)
            if not acc or not acc.is_active:
                raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı")
            db.add(
                BankMovement(
                    bank_account_id=acc.id,
                    movement_type="deposit",
                    amount=amount,
                    movement_date=mov_date,
                    note=note,
                    customer_id=order.customer_id,
                )
            )

    order.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="order_payment",
        entity_id=payment.id,
        detail={"order_id": order.id, "amount": float(amount), "method": payment.method},
    )
    return _to_out(_load_order(db, order.id))



@router.get("/{order_id}/design-files", response_model=list[OrderDesignFileOut])
def list_design_files(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> list[OrderDesignFileOut]:
    _load_order(db, order_id)
    rows = (
        db.query(OrderDesignFile)
        .filter(OrderDesignFile.order_id == order_id)
        .order_by(OrderDesignFile.id.desc())
        .all()
    )
    return [OrderDesignFileOut.model_validate(r) for r in rows]


@router.post(
    "/{order_id}/design-files",
    response_model=OrderDesignFileOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_design_file(
    order_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış", "üretim")),
) -> OrderDesignFileOut:
    _load_order(db, order_id)
    original = design_store.safe_original_name(file.filename or "dosya")
    stored = design_store.make_stored_name(original)
    dest = design_store.absolute_path(stored)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya 25MB sınırını aşıyor")
    dest.write_bytes(content)
    row = OrderDesignFile(
        order_id=order_id,
        original_filename=original,
        stored_filename=stored,
        content_type=file.content_type,
        size_bytes=len(content),
        uploaded_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="order_design_file",
        entity_id=row.id,
        detail={"order_id": order_id, "filename": original},
    )
    return OrderDesignFileOut.model_validate(row)


@router.get("/{order_id}/design-files/{file_id}/download")
def download_design_file(
    order_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim")),
):
    row = (
        db.query(OrderDesignFile)
        .filter(OrderDesignFile.id == file_id, OrderDesignFile.order_id == order_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    path = design_store.absolute_path(row.stored_filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Dosya diskte yok")
    return FileResponse(
        path,
        media_type=row.content_type or "application/octet-stream",
        filename=row.original_filename,
    )


@router.delete("/{order_id}/design-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_design_file(
    order_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> None:
    row = (
        db.query(OrderDesignFile)
        .filter(OrderDesignFile.id == file_id, OrderDesignFile.order_id == order_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    path = design_store.absolute_path(row.stored_filename)
    name = row.original_filename
    db.delete(row)
    db.commit()
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="order_design_file",
        entity_id=file_id,
        detail={"order_id": order_id, "filename": name},
    )
