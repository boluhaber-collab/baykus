"""Satış (sipariş) satır KDV oranı/tutarı + fatura altı genel indirim sütunları.

Sadece eksik sütunları ekler. Yeni eklenen başlık sütunları mevcut kayıtlardan doldurulur
(discount_value = discount_amount, subtotal = Σ satır neti); toplamlar değişmez.
"""

from __future__ import annotations

from typing import Any

_LINE_COLS = {
    "tax_rate": "NUMERIC(5, 2) NOT NULL DEFAULT 0",
    "tax_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
}
_HEAD_COLS = {
    "discount_type": "VARCHAR(10) NOT NULL DEFAULT 'amount'",
    "discount_value": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "subtotal": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "tax_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
}

# Müşteri tahsilatı → satış eşleştirmesi (kendi kasa/cari hareketi olmayan Payment)
_PAYMENT_COLS = {
    "cari_movement_id": "INTEGER",
}


def run_startup_migrate() -> dict[str, Any]:
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        added: list[str] = []
        with engine.begin() as conn:
            for table, cols in (
                ("order_lines", _LINE_COLS),
                ("orders", _HEAD_COLS),
                ("payments", _PAYMENT_COLS),
            ):
                if table not in tables:
                    continue
                have = {c["name"] for c in insp.get_columns(table)}
                for name, ddl in cols.items():
                    if name not in have:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                        added.append(f"{table}.{name}")
            if "orders.discount_value" in added:
                conn.execute(
                    text(
                        "UPDATE orders SET discount_type = 'amount', discount_value = COALESCE(discount_amount, 0) "
                        "WHERE COALESCE(discount_amount, 0) > 0"
                    )
                )
            if "orders.subtotal" in added and "order_lines" in tables:
                conn.execute(
                    text(
                        "UPDATE orders SET subtotal = COALESCE((SELECT SUM(line_total) FROM order_lines l "
                        "WHERE l.order_id = orders.id), 0)"
                    )
                )
            if "payments.cari_movement_id" in added:
                # Eski sürüm "açık siparişlere işle" eşleştirmeleri: müşterili siparişte aynı tutarlı
                # sipariş-bağlı cari tahsilatı olmayan Payment → eşleştirme (0 = kaynak bilinmiyor).
                conn.execute(
                    text(
                        "UPDATE payments SET cari_movement_id = 0 WHERE cari_movement_id IS NULL "
                        "AND order_id IN (SELECT id FROM orders WHERE customer_id IS NOT NULL) "
                        "AND NOT EXISTS (SELECT 1 FROM cari_movements cm WHERE cm.order_id = payments.order_id "
                        "AND cm.movement_type IN ('payment','deposit') AND ABS(cm.credit - payments.amount) < 0.02)"
                    )
                )
        return {"ok": True, "added": added}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
