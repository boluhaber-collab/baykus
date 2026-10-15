"""Ensure order_lines.line_note and purchase_lines.line_note exist."""

from __future__ import annotations

from typing import Any


def run_startup_migrate() -> dict[str, Any]:
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        added: list[str] = []
        with engine.begin() as conn:
            for t in ("order_lines", "purchase_lines"):
                if t not in tables:
                    continue
                cols = {c["name"] for c in insp.get_columns(t)}
                if "line_note" not in cols:
                    conn.execute(text(f"ALTER TABLE {t} ADD COLUMN line_note TEXT"))
                    added.append(t)
        return {"ok": True, "added": added}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
