"""Ensure mail_messages table exists (SQLite create_all additive)."""

from __future__ import annotations

from typing import Any


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
        return {"ok": True, "created": created, "had_mail": "mail_messages" in before}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
