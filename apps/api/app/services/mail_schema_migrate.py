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


def _ensure_account_column() -> dict[str, Any]:
    """Add account_id; assign legacy (NULL) rows to account #1 when it exists."""
    from sqlalchemy import inspect, text

    from app.db.session import engine
    from app.services.mail_accounts import list_accounts

    insp = inspect(engine)
    if "mail_messages" not in insp.get_table_names():
        return {"added": False, "assigned": 0}
    cols = {c["name"] for c in insp.get_columns("mail_messages")}
    added = False
    with engine.begin() as conn:
        if "account_id" not in cols:
            conn.execute(text("ALTER TABLE mail_messages ADD COLUMN account_id INTEGER"))
            added = True
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_mail_messages_account_id ON mail_messages (account_id)")
        )
    assigned = 0
    accounts = list_accounts()  # triggers legacy → hesap #1 migration
    if any(a.id == 1 for a in accounts):
        with engine.begin() as conn:
            res = conn.execute(text("UPDATE mail_messages SET account_id = 1 WHERE account_id IS NULL"))
            assigned = int(res.rowcount or 0)
    return {"added": added, "assigned": assigned}


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
        acct = _ensure_account_column()
        return {
            "ok": True,
            "created": created,
            "had_mail": "mail_messages" in before,
            "attachments_col_added": altered,
            "account_col_added": acct.get("added"),
            "assigned_to_account_1": acct.get("assigned"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
