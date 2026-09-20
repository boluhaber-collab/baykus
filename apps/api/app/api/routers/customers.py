"""Customers CRUD + Cari (current account) ledger."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.customer import CARI_MOVEMENT_TYPES, CariMovement, Customer
from app.models.order import Order
from app.models.user import User
from app.schemas.customer import (
    CariMovementCreate,
    CariMovementOut,
    CustomerCreate,
    CustomerDetailOut,
    CustomerOrderBrief,
    CustomerOut,
    CustomerUpdate,
    ReceivableItem,
    StatementOut,
)

router = APIRouter(prefix="/customers", tags=["customers"])

READ_ROLES = ("admin", "satış", "muhasebe")
WRITE_ROLES = ("admin", "satış")
CARI_WRITE_ROLES = ("admin", "satış", "muhasebe")


def _balance_for(db: Session, customer: Customer) -> Decimal:
    row = (
        db.query(
            func.coalesce(func.sum(CariMovement.debit), 0),
            func.coalesce(func.sum(CariMovement.credit), 0),
        )
        .filter(CariMovement.customer_id == customer.id)
        .one()
    )
    debit_sum = Decimal(str(row[0]))
    credit_sum = Decimal(str(row[1]))
    opening = customer.opening_balance or Decimal("0")
    return opening + debit_sum - credit_sum


def _balances_map(db: Session, customer_ids: list[int]) -> dict[int, tuple[Decimal, Decimal]]:
    """Return {customer_id: (debit_sum, credit_sum)}."""
    if not customer_ids:
        return {}
    rows = (
        db.query(
            CariMovement.customer_id,
            func.coalesce(func.sum(CariMovement.debit), 0),
            func.coalesce(func.sum(CariMovement.credit), 0),
        )
        .filter(CariMovement.customer_id.in_(customer_ids))
        .group_by(CariMovement.customer_id)
        .all()
    )
    return {r[0]: (Decimal(str(r[1])), Decimal(str(r[2]))) for r in rows}


def _customer_out(customer: Customer, balance: Decimal) -> CustomerOut:
    return CustomerOut(
        id=customer.id,
        code=customer.code,
        name=customer.name,
        company=customer.company,
        email=customer.email,
        phone=customer.phone,
        city=customer.city,
        address=customer.address,
        tax_number=customer.tax_number,
        tax_office=customer.tax_office,
        notes=customer.notes,
        is_active=bool(customer.is_active),
        special_day_note=customer.special_day_note,
        special_day_date=customer.special_day_date,
        opening_balance=customer.opening_balance or Decimal("0"),
        balance=balance,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


def _movement_out(m: CariMovement, running: Decimal | None = None) -> CariMovementOut:
    order_number = None
    if m.order is not None:
        order_number = m.order.order_number
    return CariMovementOut(
        id=m.id,
        customer_id=m.customer_id,
        movement_type=m.movement_type,
        debit=m.debit or Decimal("0"),
        credit=m.credit or Decimal("0"),
        movement_date=m.movement_date,
        order_id=m.order_id,
        order_number=order_number,
        note=m.note,
        created_at=m.created_at,
        running_balance=running,
    )


def _split_amount(movement_type: str, amount: Decimal, side: str | None) -> tuple[Decimal, Decimal]:
    if movement_type == "sale":
        return amount, Decimal("0")
    if movement_type in ("payment", "deposit"):
        return Decimal("0"), amount
    # adjustment
    if side == "credit":
        return Decimal("0"), amount
    return amount, Decimal("0")


def _paid_for_order(order: Order) -> Decimal:
    return sum((p.amount for p in order.payments), Decimal("0"))


@router.get("", response_model=list[CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    has_balance: bool | None = Query(default=None),
    skip: int = 0,
    limit: int = 200,
) -> list[CustomerOut]:
    query = db.query(Customer)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Customer.name.ilike(like),
                Customer.company.ilike(like),
                Customer.email.ilike(like),
                Customer.phone.ilike(like),
                Customer.code.ilike(like),
                Customer.tax_number.ilike(like),
            )
        )
    if active is not None:
        query = query.filter(Customer.is_active.is_(active))
    customers = query.order_by(Customer.name.asc()).offset(skip).limit(limit).all()
    bal_map = _balances_map(db, [c.id for c in customers])
    result: list[CustomerOut] = []
    for c in customers:
        debit_s, credit_s = bal_map.get(c.id, (Decimal("0"), Decimal("0")))
        balance = (c.opening_balance or Decimal("0")) + debit_s - credit_s
        if has_balance is True and balance <= 0:
            continue
        if has_balance is False and balance > 0:
            continue
        result.append(_customer_out(c, balance))
    return result


@router.get("/receivables", response_model=list[ReceivableItem])
def open_receivables(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[ReceivableItem]:
    customers = db.query(Customer).filter(Customer.is_active.is_(True)).order_by(Customer.name).all()
    bal_map = _balances_map(db, [c.id for c in customers])
    last_dates = dict(
        db.query(CariMovement.customer_id, func.max(CariMovement.movement_date))
        .group_by(CariMovement.customer_id)
        .all()
    )
    items: list[ReceivableItem] = []
    for c in customers:
        debit_s, credit_s = bal_map.get(c.id, (Decimal("0"), Decimal("0")))
        balance = (c.opening_balance or Decimal("0")) + debit_s - credit_s
        if balance <= 0:
            continue
        items.append(
            ReceivableItem(
                customer_id=c.id,
                code=c.code,
                name=c.name,
                company=c.company,
                phone=c.phone,
                city=c.city,
                balance=balance,
                last_movement_date=last_dates.get(c.id),
            )
        )
    items.sort(key=lambda x: x.balance, reverse=True)
    return items


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> CustomerOut:
    data = payload.model_dump()
    if data.get("code"):
        existing = db.query(Customer).filter(Customer.code == data["code"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Müşteri kodu zaten kullanılıyor")
    customer = Customer(**data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _customer_out(customer, customer.opening_balance or Decimal("0"))


@router.get("/{customer_id}", response_model=CustomerDetailOut)
def get_customer_detail(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> CustomerDetailOut:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    balance = _balance_for(db, customer)
    base = _customer_out(customer, balance)

    orders = (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .limit(10)
        .all()
    )
    recent_orders: list[CustomerOrderBrief] = []
    for o in orders:
        paid = _paid_for_order(o)
        remaining = (o.total_amount or Decimal("0")) - paid
        if remaining < 0:
            remaining = Decimal("0")
        recent_orders.append(
            CustomerOrderBrief(
                id=o.id,
                order_number=o.order_number,
                status=o.status,
                total_amount=o.total_amount or Decimal("0"),
                remaining_amount=remaining,
                due_date=o.due_date,
                created_at=o.created_at,
            )
        )

    movements = (
        db.query(CariMovement)
        .filter(CariMovement.customer_id == customer_id)
        .order_by(CariMovement.movement_date.desc(), CariMovement.id.desc())
        .limit(15)
        .all()
    )
    recent_movements = [_movement_out(m) for m in movements]

    timeline: list[dict] = []
    for o in recent_orders:
        timeline.append(
            {
                "kind": "order",
                "date": o.created_at.date().isoformat() if o.created_at else None,
                "label": f"Sipariş {o.order_number}",
                "status": o.status,
                "amount": float(o.total_amount),
                "ref_id": o.id,
            }
        )
    for m in recent_movements:
        timeline.append(
            {
                "kind": "movement",
                "date": m.movement_date.isoformat(),
                "label": m.movement_type,
                "note": m.note,
                "debit": float(m.debit),
                "credit": float(m.credit),
                "ref_id": m.id,
            }
        )
    if customer.notes:
        timeline.append(
            {
                "kind": "note",
                "date": customer.updated_at.date().isoformat() if customer.updated_at else None,
                "label": "Müşteri notu",
                "note": customer.notes,
            }
        )
    timeline.sort(key=lambda x: x.get("date") or "", reverse=True)

    return CustomerDetailOut(
        **base.model_dump(),
        recent_orders=recent_orders,
        recent_movements=recent_movements,
        timeline=timeline[:20],
    )


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> CustomerOut:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        clash = (
            db.query(Customer)
            .filter(Customer.code == data["code"], Customer.id != customer_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Müşteri kodu zaten kullanılıyor")
    for key, value in data.items():
        setattr(customer, key, value)
    customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(customer)
    return _customer_out(customer, _balance_for(db, customer))


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    db.delete(customer)
    db.commit()


@router.get("/{customer_id}/movements", response_model=list[CariMovementOut])
def list_movements(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    skip: int = 0,
    limit: int = 200,
) -> list[CariMovementOut]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    rows = (
        db.query(CariMovement)
        .filter(CariMovement.customer_id == customer_id)
        .order_by(CariMovement.movement_date.desc(), CariMovement.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_movement_out(m) for m in rows]


@router.post(
    "/{customer_id}/movements",
    response_model=CariMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def create_movement(
    customer_id: int,
    payload: CariMovementCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*CARI_WRITE_ROLES)),
) -> CariMovementOut:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    if payload.movement_type not in CARI_MOVEMENT_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz hareket tipi")
    if payload.order_id is not None:
        order = db.get(Order, payload.order_id)
        if not order or order.customer_id != customer_id:
            raise HTTPException(status_code=400, detail="Sipariş bu müşteriye ait değil")
    debit, credit = _split_amount(payload.movement_type, payload.amount, payload.side)
    mov_date = payload.movement_date or date.today()
    movement = CariMovement(
        customer_id=customer_id,
        movement_type=payload.movement_type,
        debit=debit,
        credit=credit,
        movement_date=mov_date,
        order_id=payload.order_id,
        note=payload.note,
    )
    db.add(movement)
    db.flush()

    # Nice-to-have: mirror payment/deposit into kasa or banka
    if (
        payload.post_to_finance
        and payload.movement_type in ("payment", "deposit")
        and payload.finance_method
    ):
        from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister

        note = payload.note or f"Cari {payload.movement_type} — müşteri #{customer_id}"
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
                        amount=payload.amount,
                        movement_date=mov_date,
                        note=note,
                        customer_id=customer_id,
                        cari_movement_id=movement.id,
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
                    amount=payload.amount,
                    movement_date=mov_date,
                    note=note,
                    customer_id=customer_id,
                    cari_movement_id=movement.id,
                )
            )

    db.commit()
    db.refresh(movement)
    return _movement_out(movement)


@router.get("/{customer_id}/statement", response_model=StatementOut)
def customer_statement(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> StatementOut:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")

    query = db.query(CariMovement).filter(CariMovement.customer_id == customer_id)
    if from_date:
        query = query.filter(CariMovement.movement_date >= from_date)
    if to_date:
        query = query.filter(CariMovement.movement_date <= to_date)
    rows = query.order_by(CariMovement.movement_date.asc(), CariMovement.id.asc()).all()

    # Opening for statement period: full opening + movements before from_date
    running = customer.opening_balance or Decimal("0")
    if from_date:
        prior = (
            db.query(
                func.coalesce(func.sum(CariMovement.debit), 0),
                func.coalesce(func.sum(CariMovement.credit), 0),
            )
            .filter(
                CariMovement.customer_id == customer_id,
                CariMovement.movement_date < from_date,
            )
            .one()
        )
        running = running + Decimal(str(prior[0])) - Decimal(str(prior[1]))

    opening = running
    out_rows: list[CariMovementOut] = []
    for m in rows:
        running = running + (m.debit or Decimal("0")) - (m.credit or Decimal("0"))
        out_rows.append(_movement_out(m, running))

    return StatementOut(
        customer_id=customer.id,
        customer_name=customer.name,
        opening_balance=opening,
        closing_balance=running,
        movements=out_rows,
    )
