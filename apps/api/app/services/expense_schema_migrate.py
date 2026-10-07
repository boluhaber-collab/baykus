"""Ensure expenses.is_cancelled exists (SQLite create_all cannot ALTER existing tables)."""

from __future__ import annotations

import logging

log = logging.getLogger("baykus.expense_schema_migrate")


def ensure_expense_cancelled_column() -> bool:
    """Add expenses.is_cancelled if missing. Returns True when a column was added."""
    from sqlalchemy import inspect, text

    from app.db.session import engine

    insp = inspect(engine)
    if "expenses" not in insp.get_table_names():
        return False
    cols = {c["name"] for c in insp.get_columns("expenses")}
    if "is_cancelled" in cols:
        return False
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "sqlite":
            conn.execute(
                text(
                    "ALTER TABLE expenses ADD COLUMN is_cancelled BOOLEAN "
                    "DEFAULT 0 NOT NULL"
                )
            )
        else:
            conn.execute(
                text(
                    "ALTER TABLE expenses ADD COLUMN is_cancelled BOOLEAN "
                    "DEFAULT false NOT NULL"
                )
            )
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_expenses_is_cancelled "
                        "ON expenses (is_cancelled)"
                    )
                )
            except Exception:  # noqa: BLE001
                pass
    log.info("added expenses.is_cancelled")
    return True


def heal_orphan_posted_expenses() -> int:
    """Posted expenses whose cash/bank legs are gone → soft-cancel (list cleanup)."""
    from app.db.session import SessionLocal
    from app.models.expense import Expense
    from app.models.finance import BankMovement, CashMovement

    db = SessionLocal()
    try:
        rows = (
            db.query(Expense)
            .filter(Expense.is_posted.is_(True), Expense.is_cancelled.is_(False))
            .all()
        )
        healed = 0
        for exp in rows:
            cash_ok = True
            bank_ok = True
            if exp.cash_movement_id:
                cash_ok = db.get(CashMovement, exp.cash_movement_id) is not None
            if exp.bank_movement_id:
                bank_ok = db.get(BankMovement, exp.bank_movement_id) is not None
            # Posted with a movement id that no longer exists → orphan after ledger delete
            orphan = False
            if exp.cash_movement_id and not cash_ok:
                orphan = True
                exp.cash_movement_id = None
            if exp.bank_movement_id and not bank_ok:
                orphan = True
                exp.bank_movement_id = None
            if orphan and not exp.cash_movement_id and not exp.bank_movement_id:
                exp.is_posted = False
                exp.is_cancelled = True
                healed += 1
        if healed:
            db.commit()
            log.info("healed %s orphan posted expenses → cancelled", healed)
        return healed
    finally:
        db.close()


def run_startup_migrate() -> dict | None:
    try:
        added = ensure_expense_cancelled_column()
        healed = 0
        try:
            healed = heal_orphan_posted_expenses()
        except Exception as exc:  # noqa: BLE001
            log.warning("expense orphan heal skipped: %s", exc)
        result = {"is_cancelled_added": added, "orphans_healed": healed}
        # Visible on panel / console so Engin sees migrate ran after restart
        print(
            f"[baykus] expenses.is_cancelled migrate: "
            f"column_added={added} orphans_healed={healed}",
            flush=True,
        )
        log.info("expense schema migrate done: %s", result)
        return result
    except Exception as exc:  # noqa: BLE001
        print(f"[baykus] expenses.is_cancelled migrate FAILED: {exc}", flush=True)
        log.warning("expense schema migrate skipped: %s", exc)
        return None
