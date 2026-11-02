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


def run_startup_migrate() -> dict[str, Any]:
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        added: list[str] = []
        with engine.begin() as conn:
            for table, cols in (("order_lines", _LINE_COLS), ("orders", _HEAD_COLS)):
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
        return {"ok": True, "added": added}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
