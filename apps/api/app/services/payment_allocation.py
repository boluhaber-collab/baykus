"""Cari tahsilat → sipariş/satış faturası eşleştirmesi (FIFO).

Müşteri kartından girilen tahsilat (cari 'payment' + kasa/banka) satıştan bağımsız bir
kayıttır. Satışın "kalan" tutarını kapatmak için siparişe yalnızca bir *eşleştirme*
Payment satırı yazılır; bu satır ``cari_movement_id`` ile tahsilata bağlanır ve kendi
kasa/banka/cari hareketi YOKTUR. Böylece:

* satış düzenlenince eşleştirme yeniden kasa/cari tahsilatı üretmez (çift tahsilat yok),
* tahsilat silinince/değişince eşleştirme de kalkar/yeniden hesaplanır,
* satış iptal edilirse eşleştirme silinir, tahsilat müşteri alacağı (avans) olarak kalır.

``cari_movement_id = 0`` → eski sürümde oluşturulmuş, kaynağı bilinmeyen eşleştirme.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.models.order import Order, Payment

CANCELLED = "Sipariş İptali"


def _dec(v) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:  # noqa: BLE001
        return Decimal("0")


def is_allocation(p: Payment) -> bool:
    return getattr(p, "cari_movement_id", None) is not None


def order_due(order: Order, db: Session | None = None) -> Decimal:
    """Satışın kalan tutarı. db verilirse ödemeler veritabanından (silinen/eklenenler dahil
    güncel) okunur; yüklü ilişki koleksiyonu bayat olabilir."""
    if db is not None:
        from sqlalchemy import func

        db.flush()
        paid = _dec(
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.order_id == order.id)
            .scalar()
        )
    else:
        paid = sum((_dec(p.amount) for p in (order.payments or [])), Decimal("0"))
    if paid <= 0:
        paid = _dec(order.deposit_amount)
    return _dec(order.total_amount) - paid


def allocate_tahsilat(
    db: Session,
    customer_id: int,
    amount: Decimal,
    *,
    cari_movement_id: int,
    method: str,
    note: str | None,
    mov_date: date,
) -> Decimal:
    """Tahsilatı müşterinin açık (iptal olmayan, kalanı olan) satışlarına FIFO dağıtır."""
    remaining = _dec(amount)
    applied = Decimal("0")
    if remaining <= 0:
        return applied
    orders = (
        db.query(Order)
        .options(joinedload(Order.payments))
        .filter(Order.customer_id == customer_id, Order.status != CANCELLED)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )
    for order in orders:
        if remaining <= 0:
            break
        due = order_due(order, db)
        if due <= Decimal("0.009"):
            continue
        take = min(remaining, due)
        p = Payment(
            order_id=order.id,
            amount=take,
            method=(method or "nakit")[:50],
            status="tamamlandi",
            paid_at=datetime.combine(mov_date, datetime.min.time()),
            notes=f"{(note or 'Müşteri tahsilatı').strip()} → {order.order_number}",
            cari_movement_id=cari_movement_id,
        )
        db.add(p)
        db.flush()
        remaining -= take
        applied += take
    return applied


def release_allocations(db: Session, cari_movement_id: int) -> int:
    rows = db.query(Payment).filter(Payment.cari_movement_id == cari_movement_id).all()
    for p in rows:
        db.delete(p)
    return len(rows)


def reapply_allocations(db: Session, order: Order, allocs: list[dict]) -> None:
    """Satış düzenlemesi sonrası eşleştirmeleri yeni kalan tutara göre geri yazar."""
    for a in allocs:
        due = order_due(order, db)
        if due <= Decimal("0.009"):
            break
        take = min(_dec(a["amount"]), due)
        if take <= 0:
            continue
        p = Payment(
            order_id=order.id,
            amount=take,
            method=(a.get("method") or "nakit")[:50],
            status="tamamlandi",
            paid_at=a.get("paid_at") or datetime.utcnow(),
            notes=a.get("notes"),
            cari_movement_id=a.get("cari_movement_id"),
        )
        db.add(p)
        db.flush()
