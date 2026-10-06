"""Sale → kasa/banka Açıklama labels: Kapora vs Satış tahsilatı.

Kapora = partial deposit / prepayment only.
Full payment (peşin / remaining ≈ 0) → Satış tahsilatı.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

_KAPORA_NOTE_RE = re.compile(
    r"^(Kapora)\s+(\S+)(\s*\(\d+/\d+\))?\s*$",
    re.IGNORECASE,
)


def _dec(value: Decimal | float | int | str | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def order_payment_finance_note(order_number: str, *, total: Decimal, paid: Decimal) -> str:
    """Note for cash/bank/cari when posting sale payment on create."""
    on = (order_number or "").strip() or "?"
    total_a = _dec(total)
    paid_a = _dec(paid)
    # Full (or over) collection → Tahsilat; partial → Kapora
    if paid_a > 0 and (total_a <= 0 or paid_a + Decimal("0.01") >= total_a):
        return f"Satış tahsilatı {on}"
    return f"Kapora {on}"


def _order_effective_paid(order: Any) -> Decimal:
    payments = getattr(order, "payments", None) or []
    paid = sum((_dec(getattr(p, "amount", 0)) for p in payments), Decimal("0"))
    if paid > 0:
        return paid
    return _dec(getattr(order, "deposit_amount", 0))


def rewrite_kapora_note_if_fully_paid(db: Session | None, note: str | None) -> str | None:
    """Display sanitize: Kapora SIP-… → Satış tahsilatı when order is fully paid.

    Leaves true partial deposits and non-matching notes unchanged.
    DB rows stay as-is unless the user edits/saves.
    """
    if not note or db is None:
        return note
    raw = str(note).strip()
    m = _KAPORA_NOTE_RE.match(raw)
    if not m:
        return note
    order_number = m.group(2)
    suffix = m.group(3) or ""
    try:
        from app.models.order import Order

        order = db.query(Order).filter(Order.order_number == order_number).first()
    except Exception:
        return note
    if not order:
        return note
    total = _dec(getattr(order, "total_amount", 0))
    paid = _order_effective_paid(order)
    if paid > 0 and (total <= 0 or paid + Decimal("0.01") >= total):
        return f"Satış tahsilatı {order_number}{suffix}"
    return note
