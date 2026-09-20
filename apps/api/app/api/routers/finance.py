"""Finance: Cash (Kasa) + Bank (Banka) — full CRUD and transfers."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.customer import CariMovement, Customer
from app.models.expense import Expense
from app.models.order import Order
from app.models.supplier import Supplier, SupplierMovement
from app.models.finance import (
    BANK_IN_TYPES,
    BANK_MOVEMENT_TYPES,
    BANK_OUT_TYPES,
    CASH_IN_TYPES,
    CASH_MOVEMENT_TYPES,
    CASH_OUT_TYPES,
    BankAccount,
    BankMovement,
    CashMovement,
    CashRegister,
)
from app.models.user import User
from app.schemas.finance import (
    BankAccountCreate,
    BankAccountOut,
    BankAccountUpdate,
    BankMovementCreate,
    BankMovementOut,
    CashMovementCreate,
    CashMovementOut,
    CashRegisterOut,
    CashRegisterUpdate,
    FinanceSummary,
    RecentMovement,
    TransferCreate,
    TransferOut,
)

router = APIRouter(prefix="/finance", tags=["finance"])

READ_ROLES = ("admin", "muhasebe", "satış")
WRITE_ROLES = ("admin", "muhasebe")


def _dec(v) -> Decimal:
    return Decimal(str(v or 0))


def _cash_direction(movement_type: str) -> str:
    if movement_type in CASH_IN_TYPES:
        return "in"
    return "out"


def _bank_direction(movement_type: str) -> str:
    if movement_type in BANK_IN_TYPES:
        return "in"
    return "out"


def _cash_balance(db: Session, register: CashRegister) -> Decimal:
    row = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (CashMovement.movement_type.in_(CASH_IN_TYPES), CashMovement.amount),
                        else_=-CashMovement.amount,
                    )
                ),
                0,
            )
        )
        .filter(CashMovement.cash_register_id == register.id)
        .scalar()
    )
    return _dec(register.opening_balance) + _dec(row)


def _bank_balance(db: Session, account: BankAccount) -> Decimal:
    row = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (BankMovement.movement_type.in_(BANK_IN_TYPES), BankMovement.amount),
                        else_=-BankMovement.amount,
                    )
                ),
                0,
            )
        )
        .filter(BankMovement.bank_account_id == account.id)
        .scalar()
    )
    return _dec(account.opening_balance) + _dec(row)


def _default_cash(db: Session) -> CashRegister:
    reg = (
        db.query(CashRegister)
        .filter(CashRegister.is_active.is_(True))
        .order_by(CashRegister.id.asc())
        .first()
    )
    if not reg:
        raise HTTPException(status_code=404, detail="Kasa bulunamadı — seed çalıştırın")
    return reg


def _register_out(db: Session, reg: CashRegister) -> CashRegisterOut:
    return CashRegisterOut(
        id=reg.id,
        name=reg.name,
        opening_balance=_dec(reg.opening_balance),
        currency=reg.currency or "TRY",
        is_active=bool(reg.is_active),
        balance=_cash_balance(db, reg),
        created_at=reg.created_at,
    )


def _bank_out(db: Session, acc: BankAccount) -> BankAccountOut:
    return BankAccountOut(
        id=acc.id,
        name=acc.name,
        account_type=getattr(acc, "account_type", None) or "Banka",
        institution=getattr(acc, "institution", None),
        iban=acc.iban,
        currency=acc.currency or "TRY",
        opening_balance=_dec(acc.opening_balance),
        is_active=bool(acc.is_active),
        notes=acc.notes,
        balance=_bank_balance(db, acc),
        created_at=acc.created_at,
        updated_at=acc.updated_at,
    )


def _cash_movement_out(m: CashMovement, running: Decimal | None = None) -> CashMovementOut:
    cust_name = m.customer.name if m.customer is not None else None
    bank_name = m.bank_account.name if m.bank_account is not None else None
    return CashMovementOut(
        id=m.id,
        cash_register_id=m.cash_register_id,
        movement_type=m.movement_type,
        amount=_dec(m.amount),
        movement_date=m.movement_date,
        category=m.category,
        note=m.note,
        customer_id=m.customer_id,
        customer_name=cust_name,
        bank_account_id=m.bank_account_id,
        bank_account_name=bank_name,
        transfer_group_id=m.transfer_group_id,
        cari_movement_id=m.cari_movement_id,
        created_by_user_id=m.created_by_user_id,
        created_at=m.created_at,
        running_balance=running,
        direction=_cash_direction(m.movement_type),
    )


def _bank_movement_out(m: BankMovement, running: Decimal | None = None) -> BankMovementOut:
    cust_name = m.customer.name if m.customer is not None else None
    acc_name = m.bank_account.name if m.bank_account is not None else None
    return BankMovementOut(
        id=m.id,
        bank_account_id=m.bank_account_id,
        bank_account_name=acc_name,
        movement_type=m.movement_type,
        amount=_dec(m.amount),
        movement_date=m.movement_date,
        category=m.category,
        note=m.note,
        customer_id=m.customer_id,
        customer_name=cust_name,
        cash_register_id=m.cash_register_id,
        counterpart_bank_account_id=m.counterpart_bank_account_id,
        transfer_group_id=m.transfer_group_id,
        cari_movement_id=m.cari_movement_id,
        created_by_user_id=m.created_by_user_id,
        created_at=m.created_at,
        running_balance=running,
        direction=_bank_direction(m.movement_type),
    )


def _day_sum(db: Session, model, type_field, amount_field, types: tuple, day: date, **filters) -> Decimal:
    q = db.query(func.coalesce(func.sum(amount_field), 0)).filter(
        type_field.in_(types),
        model.movement_date == day,
    )
    for k, v in filters.items():
        q = q.filter(getattr(model, k) == v)
    return _dec(q.scalar())


# ─── Summary ───────────────────────────────────────────────────────────────




@router.get("/open-balances")
def open_balances(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    """Combine customer receivables + supplier payables summary."""
    customers = db.query(Customer).filter(Customer.is_active.is_(True)).all()
    cust_ids = [c.id for c in customers]
    cari_map: dict[int, tuple[Decimal, Decimal]] = {}
    if cust_ids:
        for cid, d, c in (
            db.query(
                CariMovement.customer_id,
                func.coalesce(func.sum(CariMovement.debit), 0),
                func.coalesce(func.sum(CariMovement.credit), 0),
            )
            .filter(CariMovement.customer_id.in_(cust_ids))
            .group_by(CariMovement.customer_id)
            .all()
        ):
            cari_map[cid] = (_dec(d), _dec(c))

    receivables = []
    recv_total = Decimal("0")
    for c in customers:
        d, cr = cari_map.get(c.id, (Decimal("0"), Decimal("0")))
        bal = _dec(c.opening_balance) + d - cr
        if bal > 0:
            recv_total += bal
            receivables.append(
                {
                    "kind": "receivable",
                    "party_id": c.id,
                    "name": c.name,
                    "code": c.code,
                    "balance": float(bal),
                    "href": f"/customers/{c.id}",
                }
            )
    receivables.sort(key=lambda x: x["balance"], reverse=True)

    suppliers = db.query(Supplier).filter(Supplier.is_active.is_(True)).all()
    sup_ids = [s.id for s in suppliers]
    sup_map: dict[int, tuple[Decimal, Decimal]] = {}
    if sup_ids:
        for sid, d, c in (
            db.query(
                SupplierMovement.supplier_id,
                func.coalesce(func.sum(SupplierMovement.debit), 0),
                func.coalesce(func.sum(SupplierMovement.credit), 0),
            )
            .filter(SupplierMovement.supplier_id.in_(sup_ids))
            .group_by(SupplierMovement.supplier_id)
            .all()
        ):
            sup_map[sid] = (_dec(d), _dec(c))

    payables = []
    pay_total = Decimal("0")
    for s in suppliers:
        d, cr = sup_map.get(s.id, (Decimal("0"), Decimal("0")))
        bal = _dec(s.opening_balance) + d - cr
        if bal > 0:
            pay_total += bal
            payables.append(
                {
                    "kind": "payable",
                    "party_id": s.id,
                    "name": s.name,
                    "code": s.code,
                    "balance": float(bal),
                    "href": f"/suppliers/{s.id}",
                }
            )
    payables.sort(key=lambda x: x["balance"], reverse=True)


    # Desktop acik_bakiyeler: order-level open balances
    from sqlalchemy.orm import joinedload

    cancelled = {"Sipariş İptali", "İptal", "İptal Edildi", "siparis iptali"}
    order_rows = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.payments), joinedload(Order.lines))
        .filter(~Order.status.in_(list(cancelled)))
        .order_by(Order.created_at.desc())
        .limit(500)
        .all()
    )
    open_orders = []
    open_orders_total = Decimal("0")
    today = date.today()
    for o in order_rows:
        paid = sum((_dec(p.amount) for p in (o.payments or [])), Decimal("0"))
        effective_paid = paid if paid > 0 else _dec(o.deposit_amount)
        remaining = max(_dec(o.total_amount) - effective_paid, Decimal("0"))
        if remaining <= 0:
            continue
        open_orders_total += remaining
        products = ", ".join(
            (ln.description or "")[:40] for ln in (o.lines or [])[:4] if ln.description
        )
        due = o.due_date or getattr(o, "delivery_date", None)
        tag = "normal"
        if due and due < today and o.status != "Teslim Edildi":
            tag = "geciken"
        elif o.status == "Teslim Edildi":
            tag = "teslim"
        phone = o.customer.phone if o.customer is not None else None
        open_orders.append(
            {
                "order_id": o.id,
                "order_number": o.order_number,
                "customer_id": o.customer_id,
                "customer_name": o.customer.name if o.customer is not None else None,
                "customer_phone": phone,
                "order_date": o.created_at.date().isoformat() if o.created_at else None,
                "due_date": due.isoformat() if due else None,
                "status": o.status,
                "total_amount": float(_dec(o.total_amount)),
                "paid_amount": float(effective_paid),
                "open_balance": float(remaining),
                "products": products,
                "row_tag": tag,
                "href": f"/orders/{o.id}",
            }
        )

    return {
        "receivables_total": float(recv_total),
        "payables_total": float(pay_total),
        "net": float(recv_total - pay_total),
        "receivables_count": len(receivables),
        "payables_count": len(payables),
        "receivables": receivables,
        "payables": payables,
        "open_orders_total": float(open_orders_total),
        "open_orders_count": len(open_orders),
        "open_orders": open_orders,
    }

@router.get("/summary", response_model=FinanceSummary)
def finance_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> FinanceSummary:
    today = date.today()
    registers = db.query(CashRegister).order_by(CashRegister.id).all()
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.is_active.is_(True))
        .order_by(BankAccount.name)
        .all()
    )
    cash_outs = [_register_out(db, r) for r in registers]
    bank_outs = [_bank_out(db, a) for a in accounts]
    total_cash = sum((c.balance for c in cash_outs), Decimal("0"))
    total_bank = sum((b.balance for b in bank_outs), Decimal("0"))

    today_cash_in = _day_sum(db, CashMovement, CashMovement.movement_type, CashMovement.amount, CASH_IN_TYPES, today)
    today_cash_out = _day_sum(db, CashMovement, CashMovement.movement_type, CashMovement.amount, CASH_OUT_TYPES, today)
    today_bank_in = _day_sum(db, BankMovement, BankMovement.movement_type, BankMovement.amount, BANK_IN_TYPES, today)
    today_bank_out = _day_sum(db, BankMovement, BankMovement.movement_type, BankMovement.amount, BANK_OUT_TYPES, today)

    cash_today_n = db.query(CashMovement).filter(CashMovement.movement_date == today).count()
    bank_today_n = db.query(BankMovement).filter(BankMovement.movement_date == today).count()

    recent: list[RecentMovement] = []
    for m in (
        db.query(CashMovement)
        .order_by(CashMovement.movement_date.desc(), CashMovement.id.desc())
        .limit(10)
        .all()
    ):
        recent.append(
            RecentMovement(
                source="cash",
                id=m.id,
                movement_type=m.movement_type,
                amount=_dec(m.amount),
                movement_date=m.movement_date,
                note=m.note,
                account_name=m.cash_register.name if m.cash_register else "Kasa",
                direction=_cash_direction(m.movement_type),
                created_at=m.created_at,
            )
        )
    for m in (
        db.query(BankMovement)
        .order_by(BankMovement.movement_date.desc(), BankMovement.id.desc())
        .limit(10)
        .all()
    ):
        recent.append(
            RecentMovement(
                source="bank",
                id=m.id,
                movement_type=m.movement_type,
                amount=_dec(m.amount),
                movement_date=m.movement_date,
                note=m.note,
                account_name=m.bank_account.name if m.bank_account else None,
                direction=_bank_direction(m.movement_type),
                created_at=m.created_at,
            )
        )
    recent.sort(key=lambda x: (x.movement_date, x.created_at), reverse=True)
    recent = recent[:15]

    # Optional cari receivables total
    receivables = None
    try:
        customers = db.query(Customer).filter(Customer.is_active.is_(True)).all()
        total_recv = Decimal("0")
        for c in customers:
            row = (
                db.query(
                    func.coalesce(func.sum(CariMovement.debit), 0),
                    func.coalesce(func.sum(CariMovement.credit), 0),
                )
                .filter(CariMovement.customer_id == c.id)
                .one()
            )
            bal = _dec(c.opening_balance) + _dec(row[0]) - _dec(row[1])
            if bal > 0:
                total_recv += bal
        receivables = total_recv
    except Exception:
        receivables = None

    return FinanceSummary(
        total_cash=total_cash,
        total_bank=total_bank,
        total_liquidity=total_cash + total_bank,
        cash_registers=cash_outs,
        bank_accounts=bank_outs,
        today_cash_in=today_cash_in,
        today_cash_out=today_cash_out,
        today_bank_in=today_bank_in,
        today_bank_out=today_bank_out,
        today_movements_count=cash_today_n + bank_today_n,
        recent_movements=recent,
        receivables=receivables,
    )


# ─── Cash ──────────────────────────────────────────────────────────────────



@router.get("/cash/daily")
def cash_daily_panel(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
) -> dict:
    """Desktop gunluk_kasa_paneli — özet kartlar + siparişler + kasa/banka hareketleri."""
    from sqlalchemy.orm import joinedload

    today = date.today()
    d0 = from_date or today
    d1 = to_date or today
    cancelled = {"Sipariş İptali", "İptal", "İptal Edildi"}
    quote_like = {"Teklif", "teklif"}

    orders = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.payments), joinedload(Order.lines))
        .filter(
            func.date(Order.created_at) >= d0,
            func.date(Order.created_at) <= d1,
        )
        .order_by(Order.created_at.desc())
        .limit(500)
        .all()
    )

    order_count = 0
    revenue = Decimal("0")
    collections = Decimal("0")
    remaining_sum = Decimal("0")
    delivered = 0
    quote_count = 0
    product_qty: dict[str, int] = {}
    order_rows = []
    for o in orders:
        ch = (getattr(o, "channel", None) or "")
        st = o.status or ""
        if st in quote_like or ch.lower() == "teklif":
            quote_count += 1
            continue
        if st in cancelled:
            continue
        order_count += 1
        total = _dec(o.total_amount)
        paid = sum((_dec(p.amount) for p in (o.payments or [])), Decimal("0"))
        effective_paid = paid if paid > 0 else _dec(o.deposit_amount)
        rem = max(total - effective_paid, Decimal("0"))
        revenue += total
        collections += effective_paid
        remaining_sum += rem
        if st == "Teslim Edildi":
            delivered += 1
        products = []
        for ln in o.lines or []:
            name = (ln.description or "Ürün").strip()
            qty = int(ln.quantity or 0)
            product_qty[name] = product_qty.get(name, 0) + qty
            products.append(f"{name}×{qty}" if qty else name)
        order_rows.append(
            {
                "id": o.id,
                "order_number": o.order_number,
                "document_type": "Sipariş",
                "date": o.created_at.date().isoformat() if o.created_at else None,
                "customer_name": o.customer.name if o.customer is not None else None,
                "customer_phone": getattr(o.customer, "phone", None) if o.customer is not None else None,
                "products": ", ".join(products[:3]),
                "qty": sum(int(ln.quantity or 0) for ln in (o.lines or [])),
                "total_amount": float(total),
                "deposit_amount": float(effective_paid),
                "remaining_amount": float(rem),
                "profit": None,
                "status": st,
                "href": f"/orders/{o.id}",
            }
        )

    top_product = "-"
    if product_qty:
        top_product = max(product_qty.items(), key=lambda x: x[1])[0]

    # Expenses in range
    expense_total = _dec(
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.expense_date >= d0, Expense.expense_date <= d1)
        .scalar()
    )

    # Combined movements
    cash_movs = (
        db.query(CashMovement)
        .filter(CashMovement.movement_date >= d0, CashMovement.movement_date <= d1)
        .order_by(CashMovement.movement_date.desc(), CashMovement.id.desc())
        .limit(300)
        .all()
    )
    bank_movs = (
        db.query(BankMovement)
        .filter(BankMovement.movement_date >= d0, BankMovement.movement_date <= d1)
        .order_by(BankMovement.movement_date.desc(), BankMovement.id.desc())
        .limit(300)
        .all()
    )
    movements = []
    for m in cash_movs:
        direction = _cash_direction(m.movement_type)
        amt = float(_dec(m.amount))
        movements.append(
            {
                "date": m.movement_date.isoformat(),
                "source": "Kasa",
                "account": "Ana Kasa",
                "movement_type": m.movement_type,
                "note": m.note or m.category,
                "in_amount": amt if direction == "in" else 0,
                "out_amount": amt if direction == "out" else 0,
                "payment_type": m.category or m.movement_type,
            }
        )
    for m in bank_movs:
        direction = _bank_direction(m.movement_type)
        amt = float(_dec(m.amount))
        acc_name = m.bank_account.name if m.bank_account is not None else "Banka"
        movements.append(
            {
                "date": m.movement_date.isoformat(),
                "source": "Banka",
                "account": acc_name,
                "movement_type": m.movement_type,
                "note": m.note or m.category,
                "in_amount": amt if direction == "in" else 0,
                "out_amount": amt if direction == "out" else 0,
                "payment_type": m.category or m.movement_type,
            }
        )
    movements.sort(key=lambda x: x["date"], reverse=True)

    cost = Decimal("0")  # maliyet ayrı maliyet modülünde; masaüstü Excel alanı
    gross = revenue - cost
    net = gross - expense_total
    registers = db.query(CashRegister).order_by(CashRegister.id).all()
    main = _register_out(db, registers[0]) if registers else None

    return {
        "from_date": d0.isoformat(),
        "to_date": d1.isoformat(),
        "cash_register": main.model_dump(mode="json") if main else None,
        "summary": {
            "order_count": order_count,
            "revenue": float(revenue),
            "collections": float(collections),
            "remaining": float(remaining_sum),
            "cost": float(cost),
            "gross_profit": float(gross),
            "expense": float(expense_total),
            "net_profit": float(net),
            "quote_count": quote_count,
            "delivered_count": delivered,
            "top_product": top_product,
            "top_category": "-",
        },
        "orders": order_rows,
        "movements": movements,
    }


@router.get("/cash", response_model=list[CashRegisterOut])
def list_cash_registers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[CashRegisterOut]:
    regs = db.query(CashRegister).order_by(CashRegister.id).all()
    return [_register_out(db, r) for r in regs]


@router.patch("/cash/{register_id}", response_model=CashRegisterOut)
def update_cash_register(
    register_id: int,
    payload: CashRegisterUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> CashRegisterOut:
    reg = db.get(CashRegister, register_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Kasa bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(reg, k, v)
    db.commit()
    db.refresh(reg)
    return _register_out(db, reg)


@router.get("/cash/movements", response_model=list[CashMovementOut])
def list_cash_movements(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    cash_register_id: int | None = None,
    movement_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    skip: int = 0,
    limit: int = 200,
) -> list[CashMovementOut]:
    q = db.query(CashMovement)
    if cash_register_id:
        q = q.filter(CashMovement.cash_register_id == cash_register_id)
    if movement_type:
        q = q.filter(CashMovement.movement_type == movement_type)
    if from_date:
        q = q.filter(CashMovement.movement_date >= from_date)
    if to_date:
        q = q.filter(CashMovement.movement_date <= to_date)
    rows = q.order_by(CashMovement.movement_date.desc(), CashMovement.id.desc()).offset(skip).limit(limit).all()

    # Running balance for filtered set (chronological then reverse for display)
    if cash_register_id and not movement_type and not from_date:
        reg = db.get(CashRegister, cash_register_id)
        if reg:
            chrono = list(reversed(rows))
            running = _dec(reg.opening_balance)
            # need full history for accurate running — approximate from opening + all before oldest
            if rows:
                oldest = min(r.movement_date for r in rows)
                prior = (
                    db.query(
                        func.coalesce(
                            func.sum(
                                case(
                                    (CashMovement.movement_type.in_(CASH_IN_TYPES), CashMovement.amount),
                                    else_=-CashMovement.amount,
                                )
                            ),
                            0,
                        )
                    )
                    .filter(
                        CashMovement.cash_register_id == cash_register_id,
                        CashMovement.movement_date < oldest,
                    )
                    .scalar()
                )
                # Also same-day prior ids
                running = _dec(reg.opening_balance) + _dec(prior)
                # Recalc properly: get all movements up to and including list
            all_chrono = (
                db.query(CashMovement)
                .filter(CashMovement.cash_register_id == cash_register_id)
                .order_by(CashMovement.movement_date.asc(), CashMovement.id.asc())
                .all()
            )
            bal = _dec(reg.opening_balance)
            run_map: dict[int, Decimal] = {}
            for m in all_chrono:
                if m.movement_type in CASH_IN_TYPES:
                    bal += _dec(m.amount)
                else:
                    bal -= _dec(m.amount)
                run_map[m.id] = bal
            return [_cash_movement_out(m, run_map.get(m.id)) for m in rows]

    return [_cash_movement_out(m) for m in rows]


@router.post("/cash/movements", response_model=CashMovementOut, status_code=status.HTTP_201_CREATED)
def create_cash_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> CashMovementOut:
    if payload.movement_type not in CASH_MOVEMENT_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz kasa hareket tipi")
    if payload.movement_type in ("transfer_in", "transfer_out"):
        raise HTTPException(
            status_code=400,
            detail="Transfer için /api/finance/transfers kullanın",
        )
    reg = db.get(CashRegister, payload.cash_register_id) if payload.cash_register_id else _default_cash(db)
    if not reg or not reg.is_active:
        raise HTTPException(status_code=404, detail="Kasa bulunamadı")
    if payload.customer_id is not None and not db.get(Customer, payload.customer_id):
        raise HTTPException(status_code=400, detail="Müşteri bulunamadı")

    m = CashMovement(
        cash_register_id=reg.id,
        movement_type=payload.movement_type,
        amount=payload.amount,
        movement_date=payload.movement_date or date.today(),
        category=payload.category,
        note=payload.note,
        customer_id=payload.customer_id,
        created_by_user_id=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _cash_movement_out(m)


# ─── Banks ─────────────────────────────────────────────────────────────────


@router.get("/banks", response_model=list[BankAccountOut])
def list_banks(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    active: bool | None = None,
) -> list[BankAccountOut]:
    q = db.query(BankAccount)
    if active is not None:
        q = q.filter(BankAccount.is_active.is_(active))
    accounts = q.order_by(BankAccount.name.asc()).all()
    return [_bank_out(db, a) for a in accounts]


@router.post("/banks", response_model=BankAccountOut, status_code=status.HTTP_201_CREATED)
def create_bank(
    payload: BankAccountCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> BankAccountOut:
    acc = BankAccount(
        name=payload.name.strip(),
        account_type=(payload.account_type or "Banka").strip() or "Banka",
        institution=(payload.institution.strip() if payload.institution else None),
        iban=(payload.iban.strip().replace(" ", "") if payload.iban else None),
        currency=(payload.currency or "TRY").upper(),
        opening_balance=payload.opening_balance,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _bank_out(db, acc)


@router.get("/banks/{account_id}", response_model=BankAccountOut)
def get_bank(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> BankAccountOut:
    acc = db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    return _bank_out(db, acc)


@router.put("/banks/{account_id}", response_model=BankAccountOut)
def update_bank(
    account_id: int,
    payload: BankAccountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> BankAccountOut:
    acc = db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "iban" in data and data["iban"]:
        data["iban"] = data["iban"].replace(" ", "")
    if "currency" in data and data["currency"]:
        data["currency"] = data["currency"].upper()
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(acc, k, v)
    acc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(acc)
    return _bank_out(db, acc)


@router.delete("/banks/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bank(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> None:
    acc = db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    # Soft-delete if has movements
    has_mov = db.query(BankMovement).filter(BankMovement.bank_account_id == account_id).first()
    if has_mov:
        acc.is_active = False
        acc.updated_at = datetime.utcnow()
        db.commit()
        return
    db.delete(acc)
    db.commit()


@router.get("/banks/{account_id}/movements", response_model=list[BankMovementOut])
def list_bank_account_movements(
    account_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    movement_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    skip: int = 0,
    limit: int = 200,
) -> list[BankMovementOut]:
    acc = db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    q = db.query(BankMovement).filter(BankMovement.bank_account_id == account_id)
    if movement_type:
        q = q.filter(BankMovement.movement_type == movement_type)
    if from_date:
        q = q.filter(BankMovement.movement_date >= from_date)
    if to_date:
        q = q.filter(BankMovement.movement_date <= to_date)
    rows = q.order_by(BankMovement.movement_date.desc(), BankMovement.id.desc()).offset(skip).limit(limit).all()

    all_chrono = (
        db.query(BankMovement)
        .filter(BankMovement.bank_account_id == account_id)
        .order_by(BankMovement.movement_date.asc(), BankMovement.id.asc())
        .all()
    )
    bal = _dec(acc.opening_balance)
    run_map: dict[int, Decimal] = {}
    for m in all_chrono:
        if m.movement_type in BANK_IN_TYPES:
            bal += _dec(m.amount)
        else:
            bal -= _dec(m.amount)
        run_map[m.id] = bal
    return [_bank_movement_out(m, run_map.get(m.id)) for m in rows]


@router.post(
    "/banks/{account_id}/movements",
    response_model=BankMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def create_bank_movement(
    account_id: int,
    payload: BankMovementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> BankMovementOut:
    acc = db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    if payload.movement_type not in BANK_MOVEMENT_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz banka hareket tipi")
    if payload.movement_type in ("transfer_in", "transfer_out"):
        raise HTTPException(
            status_code=400,
            detail="Transfer için /api/finance/transfers kullanın",
        )
    if payload.customer_id is not None and not db.get(Customer, payload.customer_id):
        raise HTTPException(status_code=400, detail="Müşteri bulunamadı")

    m = BankMovement(
        bank_account_id=account_id,
        movement_type=payload.movement_type,
        amount=payload.amount,
        movement_date=payload.movement_date or date.today(),
        category=payload.category,
        note=payload.note,
        customer_id=payload.customer_id,
        created_by_user_id=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _bank_movement_out(m)


@router.get("/bank-movements", response_model=list[BankMovementOut])
def list_all_bank_movements(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    bank_account_id: int | None = None,
    movement_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    skip: int = 0,
    limit: int = 200,
) -> list[BankMovementOut]:
    q = db.query(BankMovement)
    if bank_account_id:
        q = q.filter(BankMovement.bank_account_id == bank_account_id)
    if movement_type:
        q = q.filter(BankMovement.movement_type == movement_type)
    if from_date:
        q = q.filter(BankMovement.movement_date >= from_date)
    if to_date:
        q = q.filter(BankMovement.movement_date <= to_date)
    rows = q.order_by(BankMovement.movement_date.desc(), BankMovement.id.desc()).offset(skip).limit(limit).all()
    return [_bank_movement_out(m) for m in rows]


# ─── Transfers ─────────────────────────────────────────────────────────────


@router.post("/transfers", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
def create_transfer(
    payload: TransferCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> TransferOut:
    from_cash = payload.from_cash
    to_cash = payload.to_cash
    from_bank = payload.from_bank_account_id
    to_bank = payload.to_bank_account_id

    src_count = (1 if from_cash else 0) + (1 if from_bank else 0)
    dst_count = (1 if to_cash else 0) + (1 if to_bank else 0)
    if src_count != 1 or dst_count != 1:
        raise HTTPException(
            status_code=400,
            detail="Kaynak ve hedef için tam birer seçim yapın (kasa veya banka)",
        )
    if from_cash and to_cash:
        raise HTTPException(status_code=400, detail="Kasa → kasa transferi desteklenmiyor")
    if from_bank and to_bank and from_bank == to_bank:
        raise HTTPException(status_code=400, detail="Aynı banka hesabına transfer edilemez")

    mov_date = payload.movement_date or date.today()
    group_id = str(uuid.uuid4())
    cash_outs: list[CashMovementOut] = []
    bank_outs: list[BankMovementOut] = []
    note = payload.note or "Transfer"

    cash_reg = None
    if from_cash or to_cash:
        cash_reg = (
            db.get(CashRegister, payload.cash_register_id)
            if payload.cash_register_id
            else _default_cash(db)
        )
        if not cash_reg:
            raise HTTPException(status_code=404, detail="Kasa bulunamadı")

    if from_bank:
        src_acc = db.get(BankAccount, from_bank)
        if not src_acc or not src_acc.is_active:
            raise HTTPException(status_code=404, detail="Kaynak banka hesabı bulunamadı")
    if to_bank:
        dst_acc = db.get(BankAccount, to_bank)
        if not dst_acc or not dst_acc.is_active:
            raise HTTPException(status_code=404, detail="Hedef banka hesabı bulunamadı")

    # Cash → Bank
    if from_cash and to_bank:
        cm = CashMovement(
            cash_register_id=cash_reg.id,
            movement_type="transfer_out",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            bank_account_id=to_bank,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        bm = BankMovement(
            bank_account_id=to_bank,
            movement_type="transfer_in",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            cash_register_id=cash_reg.id,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        db.add_all([cm, bm])
        db.commit()
        db.refresh(cm)
        db.refresh(bm)
        cash_outs.append(_cash_movement_out(cm))
        bank_outs.append(_bank_movement_out(bm))

    # Bank → Cash
    elif from_bank and to_cash:
        bm = BankMovement(
            bank_account_id=from_bank,
            movement_type="transfer_out",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            cash_register_id=cash_reg.id,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        cm = CashMovement(
            cash_register_id=cash_reg.id,
            movement_type="transfer_in",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            bank_account_id=from_bank,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        db.add_all([bm, cm])
        db.commit()
        db.refresh(cm)
        db.refresh(bm)
        cash_outs.append(_cash_movement_out(cm))
        bank_outs.append(_bank_movement_out(bm))

    # Bank → Bank
    elif from_bank and to_bank:
        bm_out = BankMovement(
            bank_account_id=from_bank,
            movement_type="transfer_out",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            counterpart_bank_account_id=to_bank,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        bm_in = BankMovement(
            bank_account_id=to_bank,
            movement_type="transfer_in",
            amount=payload.amount,
            movement_date=mov_date,
            note=note,
            counterpart_bank_account_id=from_bank,
            transfer_group_id=group_id,
            created_by_user_id=user.id,
        )
        db.add_all([bm_out, bm_in])
        db.commit()
        db.refresh(bm_out)
        db.refresh(bm_in)
        bank_outs.extend([_bank_movement_out(bm_out), _bank_movement_out(bm_in)])

    return TransferOut(
        transfer_group_id=group_id,
        amount=payload.amount,
        movement_date=mov_date,
        note=note,
        cash_movements=cash_outs,
        bank_movements=bank_outs,
    )
