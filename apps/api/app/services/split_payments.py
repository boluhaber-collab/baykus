"""Post one or more cash/bank movements for split payments (no new tables)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister


def _dec(v: Decimal | float | int | str | None) -> Decimal:
    if v is None:
        return Decimal("0")
    return Decimal(str(v))


def resolve_cash(db: Session, cash_register_id: int | None) -> CashRegister:
    if cash_register_id:
        reg = db.get(CashRegister, cash_register_id)
        if not reg or not reg.is_active:
            raise HTTPException(status_code=400, detail="Kasa bulunamadı veya pasif")
        return reg
    reg = (
        db.query(CashRegister)
        .filter(CashRegister.is_active.is_(True))
        .order_by(CashRegister.id.asc())
        .first()
    )
    if not reg:
        raise HTTPException(status_code=400, detail="Aktif kasa bulunamadı")
    return reg


def resolve_bank(db: Session, bank_account_id: int | None) -> BankAccount:
    if bank_account_id:
        acc = db.get(BankAccount, bank_account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı veya pasif")
        return acc
    acc = (
        db.query(BankAccount)
        .filter(BankAccount.is_active.is_(True))
        .order_by(BankAccount.id.asc())
        .first()
    )
    if not acc:
        raise HTTPException(status_code=400, detail="Aktif banka hesabı bulunamadı")
    return acc


def _as_dict(p: Any) -> dict:
    if hasattr(p, "model_dump"):
        return p.model_dump()
    return dict(p)


def normalize_payment_lines(
    *,
    payments: Iterable[Any] | None = None,
    amount: Decimal | float | int | None = None,
    finance_method: str | None = None,
    cash_register_id: int | None = None,
    bank_account_id: int | None = None,
    method: str | None = None,
) -> list[dict]:
    """Return list of {amount, cash_register_id?, bank_account_id?, method?}."""
    lines: list[dict] = []
    if payments:
        for p in payments:
            d = _as_dict(p)
            amt = _dec(d.get("amount"))
            if amt <= 0:
                continue
            lines.append(
                {
                    "amount": amt,
                    "cash_register_id": d.get("cash_register_id"),
                    "bank_account_id": d.get("bank_account_id"),
                    "method": d.get("method") or d.get("payment_type") or method,
                }
            )
        return lines

    amt = _dec(amount)
    if amt <= 0:
        return []

    fm = (finance_method or "").strip().lower()
    if fm == "bank" or (bank_account_id and fm != "cash"):
        lines.append(
            {
                "amount": amt,
                "cash_register_id": None,
                "bank_account_id": bank_account_id,
                "method": method or "banka",
            }
        )
    else:
        lines.append(
            {
                "amount": amt,
                "cash_register_id": cash_register_id,
                "bank_account_id": None,
                "method": method or "nakit",
            }
        )
    return lines


def lines_total(lines: list[dict]) -> Decimal:
    return sum((l["amount"] for l in lines), Decimal("0"))


def post_finance_lines(
    db: Session,
    lines: list[dict],
    *,
    direction: str,  # "in" | "out"
    mov_date: date,
    note: str,
    customer_id: int | None = None,
    supplier_id: int | None = None,
    cari_movement_id: int | None = None,
    supplier_movement_id: int | None = None,
    created_by_user_id: int | None = None,
    category: str | None = None,
    require_account: bool = True,
) -> int:
    """Create cash/bank movements for each line. Returns count posted."""
    cash_type = "tahsilat" if direction == "in" else "odeme"
    bank_type = "deposit" if direction == "in" else "withdrawal"
    n = 0
    for idx, line in enumerate(lines, start=1):
        amt = line["amount"]
        line_note = note if len(lines) == 1 else f"{note} ({idx}/{len(lines)})"
        use_bank = line.get("bank_account_id") is not None
        use_cash = line.get("cash_register_id") is not None or not use_bank
        try:
            if use_bank:
                acc = resolve_bank(db, line.get("bank_account_id"))
                db.add(
                    BankMovement(
                        bank_account_id=acc.id,
                        movement_type=bank_type,
                        amount=amt,
                        movement_date=mov_date,
                        category=category,
                        note=line_note,
                        customer_id=customer_id,
                        supplier_id=supplier_id,
                        cari_movement_id=cari_movement_id,
                        supplier_movement_id=supplier_movement_id,
                        created_by_user_id=created_by_user_id,
                    )
                )
                n += 1
            elif use_cash:
                reg = resolve_cash(db, line.get("cash_register_id"))
                db.add(
                    CashMovement(
                        cash_register_id=reg.id,
                        movement_type=cash_type,
                        amount=amt,
                        movement_date=mov_date,
                        category=category,
                        note=line_note,
                        customer_id=customer_id,
                        supplier_id=supplier_id,
                        cari_movement_id=cari_movement_id,
                        supplier_movement_id=supplier_movement_id,
                        created_by_user_id=created_by_user_id,
                    )
                )
                n += 1
        except HTTPException:
            if require_account:
                raise
            continue
    return n
