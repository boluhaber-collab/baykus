"""Alış satır KDV oranı/tutarı + satır indirimi ve fatura altı genel indirim sütunları."""

from __future__ import annotations

from typing import Any

_LINE_COLS = {
    "discount_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "tax_rate": "NUMERIC(5, 2) NOT NULL DEFAULT 0",
    "tax_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
}
_HEAD_COLS = {
    "discount_type": "VARCHAR(10) NOT NULL DEFAULT 'amount'",
    "discount_value": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "discount_amount": "NUMERIC(12, 2) NOT NULL DEFAULT 0",
}


def run_startup_migrate() -> dict[str, Any]:
    """Sadece eksik sütunları ekler; mevcut tutarlara dokunmaz."""
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        added: list[str] = []
        with engine.begin() as conn:
            for table, cols in (("purchase_lines", _LINE_COLS), ("purchases", _HEAD_COLS)):
                if table not in tables:
                    continue
                have = {c["name"] for c in insp.get_columns(table)}
                for name, ddl in cols.items():
                    if name not in have:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                        added.append(f"{table}.{name}")
        return {"ok": True, "added": added}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
