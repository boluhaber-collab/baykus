"""Dashboard KPIs and summary aggregates from live modules."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, get_db
from app.models.customer import CariMovement, Customer
from app.models.finance import (
    BANK_IN_TYPES,
    CASH_IN_TYPES,
    BankAccount,
    BankMovement,
    CashMovement,
    CashRegister,
)
from app.models.order import CLOSED_STATUSES, ORDER_STATUSES, Order
from app.models.product import Product
from app.schemas.common import (
    DashboardSummary,
    KPIStats,
    LowStockBrief,
    RecentCariPaymentBrief,
    RecentFinanceMovementBrief,
    RecentOrderBrief,
    StatusCount,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _f(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _dec(v) -> Decimal:
    return Decimal(str(v or 0))


def _paid_amount(order: Order) -> Decimal:
    return sum((_dec(p.amount) for p in (order.payments or [])), Decimal("0"))


def _remaining(order: Order) -> Decimal:
    paid = _paid_amount(order)
    effective_paid = paid if paid > 0 else _dec(order.deposit_amount)
    return max(_dec(order.total_amount) - effective_paid, Decimal("0"))


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


def _period_bounds() -> tuple[datetime, datetime, datetime]:
    """Return (today_start, tomorrow_start, month_start) in UTC-naive datetimes."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # next day for exclusive upper bound
    from datetime import timedelta

    tomorrow = today_start + timedelta(days=1)
    month_start = today_start.replace(day=1)
    return today_start, tomorrow, month_start


def _critical_stock(db: Session, limit: int = 5) -> tuple[int, list[LowStockBrief]]:
    products = (
        db.query(Product)
        .options(joinedload(Product.variants))
        .filter(Product.is_active.is_(True), Product.product_type != "hizmet")
        .all()
    )
    items: list[LowStockBrief] = []
    for p in products:
        threshold = p.critical_stock_threshold or 0
        if p.variants:
            for v in p.variants:
                if v.stock_qty < threshold:
                    items.append(
                        LowStockBrief(
                            product_id=p.id,
                            sku=v.sku,
                            name=f"{p.name} / {v.name}",
                            stock_qty=v.stock_qty,
                            threshold=threshold,
                            variant_id=v.id,
                        )
                    )
        elif (p.stock_qty or 0) < threshold:
            items.append(
                LowStockBrief(
                    product_id=p.id,
                    sku=p.sku,
                    name=p.name,
                    stock_qty=p.stock_qty or 0,
                    threshold=threshold,
                    variant_id=None,
                )
            )
    items.sort(key=lambda x: x.stock_qty)
    return len(items), items[:limit]


def _receivables(db: Session) -> tuple[float, int, int]:
    """Return (total_receivables, customers_with_balance>0, total_customers)."""
    customers = db.query(Customer).filter(Customer.is_active.is_(True)).all()
    if not customers:
        return 0.0, 0, 0
    ids = [c.id for c in customers]
    rows = (
        db.query(
            CariMovement.customer_id,
            func.coalesce(func.sum(CariMovement.debit), 0),
            func.coalesce(func.sum(CariMovement.credit), 0),
        )
        .filter(CariMovement.customer_id.in_(ids))
        .group_by(CariMovement.customer_id)
        .all()
    )
    bal_map = {r[0]: (_dec(r[1]), _dec(r[2])) for r in rows}
    total = Decimal("0")
    with_bal = 0
    for c in customers:
        d, cr = bal_map.get(c.id, (Decimal("0"), Decimal("0")))
        bal = _dec(c.opening_balance) + d - cr
        if bal > 0:
            total += bal
            with_bal += 1
    return _f(total), with_bal, len(customers)


@router.get("/kpis", response_model=KPIStats)
def get_kpis(user: CurrentUser, db: Session = Depends(get_db)) -> KPIStats:
    """Legacy thin KPIs — real numbers, no placeholders."""
    del user
    customers = db.query(func.count(Customer.id)).scalar() or 0
    products = db.query(func.count(Product.id)).scalar() or 0
    open_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status.notin_(list(CLOSED_STATUSES)))
        .scalar()
        or 0
    )
    _, _, month_start = _period_bounds()
    revenue = (
        db.query(func.coalesce(func.sum(Order.total_amount), 0))
        .filter(Order.created_at >= month_start, Order.status != "Sipariş İptali")
        .scalar()
    )
    return KPIStats(
        customers=int(customers),
        products=int(products),
        open_orders=int(open_orders),
        revenue_month=_f(revenue),
        pending_quotes=0,  # quotes module is stub — no fake count
    )


@router.get("/summary", response_model=DashboardSummary)
def get_summary(user: CurrentUser, db: Session = Depends(get_db)) -> DashboardSummary:
    """Full dashboard aggregates from orders, stock, cari, finance."""
    del user
    today_start, tomorrow, month_start = _period_bounds()

    # ── Orders today / month ──────────────────────────────────────────────
    today_row = (
        db.query(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
        )
        .filter(
            Order.created_at >= today_start,
            Order.created_at < tomorrow,
            Order.status != "Sipariş İptali",
        )
        .one()
    )
    month_row = (
        db.query(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
        )
        .filter(Order.created_at >= month_start, Order.status != "Sipariş İptali")
        .one()
    )
    open_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status.notin_(list(CLOSED_STATUSES)))
        .scalar()
        or 0
    )

    # Kanban status counts (all statuses, zeros for missing)
    status_rows = dict(
        db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    )
    status_counts = [
        StatusCount(status=s, count=int(status_rows.get(s, 0))) for s in ORDER_STATUSES
    ]

    # ── Stock ─────────────────────────────────────────────────────────────
    critical_count, low_items = _critical_stock(db, limit=5)

    # ── Cari ──────────────────────────────────────────────────────────────
    recv_total, recv_cust, cust_count = _receivables(db)

    # ── Finance ───────────────────────────────────────────────────────────
    cash_total = Decimal("0")
    for reg in db.query(CashRegister).filter(CashRegister.is_active.is_(True)).all():
        cash_total += _cash_balance(db, reg)
    bank_total = Decimal("0")
    for acc in db.query(BankAccount).filter(BankAccount.is_active.is_(True)).all():
        bank_total += _bank_balance(db, acc)

    # ── Recent orders ─────────────────────────────────────────────────────
    recent_q = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.payments))
        .order_by(Order.created_at.desc())
        .limit(8)
        .all()
    )
    recent_orders = [
        RecentOrderBrief(
            id=o.id,
            order_number=o.order_number,
            customer_name=o.customer.name if o.customer is not None else None,
            status=o.status,
            total_amount=_dec(o.total_amount),
            remaining_amount=_remaining(o),
            created_at=o.created_at,
        )
        for o in recent_q
    ]

    # ── Recent cari payments ──────────────────────────────────────────────
    cari_pay = (
        db.query(CariMovement)
        .options(joinedload(CariMovement.customer), joinedload(CariMovement.order))
        .filter(CariMovement.movement_type.in_(("payment", "deposit")))
        .order_by(CariMovement.movement_date.desc(), CariMovement.id.desc())
        .limit(5)
        .all()
    )
    recent_cari = [
        RecentCariPaymentBrief(
            id=m.id,
            customer_id=m.customer_id,
            customer_name=m.customer.name if m.customer is not None else None,
            credit=_dec(m.credit),
            movement_date=m.movement_date,
            note=m.note,
            order_number=m.order.order_number if m.order is not None else None,
        )
        for m in cari_pay
    ]

    # ── Recent finance movements ──────────────────────────────────────────
    recent_fin: list[RecentFinanceMovementBrief] = []
    for m in (
        db.query(CashMovement)
        .options(joinedload(CashMovement.cash_register))
        .order_by(CashMovement.movement_date.desc(), CashMovement.id.desc())
        .limit(8)
        .all()
    ):
        recent_fin.append(
            RecentFinanceMovementBrief(
                source="cash",
                id=m.id,
                movement_type=m.movement_type,
                amount=_dec(m.amount),
                direction="in" if m.movement_type in CASH_IN_TYPES else "out",
                movement_date=m.movement_date,
                account_name=m.cash_register.name if m.cash_register else "Kasa",
                note=m.note,
            )
        )
    for m in (
        db.query(BankMovement)
        .options(joinedload(BankMovement.bank_account))
        .order_by(BankMovement.movement_date.desc(), BankMovement.id.desc())
        .limit(8)
        .all()
    ):
        recent_fin.append(
            RecentFinanceMovementBrief(
                source="bank",
                id=m.id,
                movement_type=m.movement_type,
                amount=_dec(m.amount),
                direction="in" if m.movement_type in BANK_IN_TYPES else "out",
                movement_date=m.movement_date,
                account_name=m.bank_account.name if m.bank_account else None,
                note=m.note,
            )
        )
    recent_fin.sort(key=lambda x: (x.movement_date, x.id), reverse=True)
    recent_fin = recent_fin[:8]

    products_count = db.query(func.count(Product.id)).scalar() or 0

    return DashboardSummary(
        orders_today_count=int(today_row[0] or 0),
        orders_today_revenue=_f(today_row[1]),
        orders_month_count=int(month_row[0] or 0),
        orders_month_revenue=_f(month_row[1]),
        open_orders=int(open_orders),
        status_counts=status_counts,
        critical_stock_count=critical_count,
        low_stock_items=low_items,
        customer_count=cust_count,
        receivables_total=recv_total,
        receivables_customer_count=recv_cust,
        cash_balance=_f(cash_total),
        bank_balance=_f(bank_total),
        total_liquidity=_f(cash_total + bank_total),
        recent_orders=recent_orders,
        recent_cari_payments=recent_cari,
        recent_finance_movements=recent_fin,
        products_count=int(products_count),
    )
