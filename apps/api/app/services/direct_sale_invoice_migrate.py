"""One-shot / idempotent: open Sipariş on invoice-direct channels → Teslim Edildi.

Direkt satış (perakende / yeni müşteri / kayıtlı müşteri) is a satış faturası, not an
open workshop order. Status-only fix; cari/stock were already posted on create.
Does not touch mağaza (Sipariş Merkezi) or mid-workflow statuses.
"""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.order import INVOICE_DIRECT_CHANNELS, Order, OrderStatusHistory

log = logging.getLogger("baykus.direct_sale_invoice_migrate")

OPEN_INVOICE_STATUSES = frozenset({"Sipariş Alındı"})


def migrate_open_invoice_direct_sales(db: Session) -> dict:
    """Flip Sipariş Alındı → Teslim Edildi on invoice-direct channels. Idempotent."""
    rows = (
        db.query(Order)
        .filter(
            Order.status.in_(tuple(OPEN_INVOICE_STATUSES)),
            Order.channel.in_(tuple(INVOICE_DIRECT_CHANNELS)),
        )
        .all()
    )
    updated = 0
    for order in rows:
        old = order.status
        order.status = "Teslim Edildi"
        if (order.design_status or "Bekliyor") in ("Bekliyor", "Onay İstendi", "bekliyor"):
            order.design_status = "Onaylandı"
        if not order.delivery_date:
            order.delivery_date = (order.due_date or (order.created_at.date() if order.created_at else None))
        if not getattr(order, "design_approved_at", None):
            order.design_approved_at = datetime.utcnow()
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                from_status=old,
                to_status="Teslim Edildi",
                note="Direkt satış → satış faturası (Sipariş Alındı düzeltmesi)",
                changed_by_user_id=None,
            )
        )
        updated += 1
    if updated:
        db.commit()
        log.info("migrated %s open invoice-direct sales to Teslim Edildi", updated)
    return {"updated": updated, "channels": sorted(INVOICE_DIRECT_CHANNELS)}


def run_startup_migrate() -> dict | None:
    """Best-effort startup hook; never raise."""
    try:
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            return migrate_open_invoice_direct_sales(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        log.warning("direct sale invoice migrate skipped: %s", exc)
        return None
