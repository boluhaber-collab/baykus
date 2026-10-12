"""Ensure price_list_items.sort_order exists; backfill by id order once."""

from __future__ import annotations

from typing import Any


def run_startup_migrate() -> dict[str, Any]:
    """Best-effort: ADD COLUMN + backfill. Never raise to caller."""
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        if "price_list_items" not in insp.get_table_names():
            return {"ok": True, "skipped": "no table"}

        cols = {c["name"] for c in insp.get_columns("price_list_items")}
        added = "sort_order" not in cols
        updated = 0

        with engine.begin() as conn:
            if added:
                conn.execute(
                    text(
                        "ALTER TABLE price_list_items "
                        "ADD COLUMN sort_order INTEGER DEFAULT 0"
                    )
                )

            # Fresh column, or any NULL: renumber each list by id (stable default).
            need = added
            if not need:
                null_n = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM price_list_items WHERE sort_order IS NULL"
                    )
                ).scalar()
                need = int(null_n or 0) > 0

            if need:
                if added:
                    list_ids = [
                        int(r[0])
                        for r in conn.execute(
                            text("SELECT DISTINCT price_list_id FROM price_list_items")
                        ).fetchall()
                    ]
                else:
                    list_ids = [
                        int(r[0])
                        for r in conn.execute(
                            text(
                                "SELECT DISTINCT price_list_id FROM price_list_items "
                                "WHERE sort_order IS NULL"
                            )
                        ).fetchall()
                    ]
                for plid in list_ids:
                    ids = [
                        int(r[0])
                        for r in conn.execute(
                            text(
                                "SELECT id FROM price_list_items "
                                "WHERE price_list_id = :p ORDER BY id ASC"
                            ),
                            {"p": plid},
                        ).fetchall()
                    ]
                    for idx, rid in enumerate(ids):
                        conn.execute(
                            text(
                                "UPDATE price_list_items SET sort_order = :o WHERE id = :id"
                            ),
                            {"o": idx, "id": rid},
                        )
                        updated += 1

        return {"ok": True, "added": added, "updated": updated}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
