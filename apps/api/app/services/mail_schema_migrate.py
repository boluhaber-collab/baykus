"""Ensure mail_messages table + attachments_json column exist."""

from __future__ import annotations

from typing import Any


def _ensure_attachments_column() -> bool:
    """SQLite create_all cannot ALTER — add attachments_json if missing."""
    from sqlalchemy import inspect, text

    from app.db.session import engine

    insp = inspect(engine)
    if "mail_messages" not in insp.get_table_names():
        return False
    cols = {c["name"] for c in insp.get_columns("mail_messages")}
    if "attachments_json" in cols:
        return False
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE mail_messages ADD COLUMN attachments_json TEXT"))
    return True


def run_startup_migrate() -> dict[str, Any]:
    try:
        import app.models  # noqa: F401
        from app.db.base import Base
        from app.db.session import engine
        from sqlalchemy import inspect

        insp = inspect(engine)
        before = set(insp.get_table_names())
        Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["mail_messages"]])
        after = set(inspect(engine).get_table_names())
        created = sorted(after - before)
        altered = _ensure_attachments_column()
        return {
            "ok": True,
            "created": created,
            "had_mail": "mail_messages" in before,
            "attachments_col_added": altered,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
