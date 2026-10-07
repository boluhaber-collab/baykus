"""Startup: decode leftover HTML entities (&#246; etc.) in note/name fields."""

from __future__ import annotations

import logging

log = logging.getLogger("baykus.html_entity_repair")

_TARGETS = [
    ("cash_movements", "note"),
    ("bank_movements", "note"),
    ("cari_movements", "note"),
    ("supplier_movements", "note"),
    ("expenses", "note"),
]


def run_startup_repair(*, limit: int = 5000) -> dict:
    """Repair up to *limit* rows that still contain &# entities. Never blocks boot hard."""
    from sqlalchemy import text

    from app.db.session import engine
    from app.utils.html_text import decode_html_entities

    fixed = 0
    scanned = 0
    try:
        with engine.begin() as conn:
            dialect = engine.dialect.name
            for table, col in _TARGETS:
                try:
                    if dialect == "sqlite":
                        rows = conn.execute(
                            text(
                                f"SELECT id, {col} FROM {table} "
                                f"WHERE {col} LIKE :pat LIMIT :lim"
                            ),
                            {"pat": "%&#%", "lim": limit},
                        ).fetchall()
                    else:
                        rows = conn.execute(
                            text(
                                f"SELECT id, {col} FROM {table} "
                                f"WHERE {col} LIKE :pat LIMIT :lim"
                            ),
                            {"pat": "%&#%", "lim": limit},
                        ).fetchall()
                except Exception:
                    continue
                for row_id, raw in rows:
                    scanned += 1
                    if raw is None:
                        continue
                    decoded = decode_html_entities(raw)
                    if decoded == raw:
                        continue
                    conn.execute(
                        text(f"UPDATE {table} SET {col} = :v WHERE id = :id"),
                        {"v": decoded, "id": row_id},
                    )
                    fixed += 1
    except Exception as exc:  # noqa: BLE001
        log.warning("html entity repair skipped: %s", exc)
        print(f"[baykus] html entity repair FAILED: {exc}", flush=True)
        return {"fixed": 0, "scanned": 0, "error": str(exc)[:120]}

    result = {"fixed": fixed, "scanned": scanned}
    if fixed:
        print(f"[baykus] html entity repair: fixed={fixed} scanned={scanned}", flush=True)
        log.info("html entity repair: %s", result)
    return result
