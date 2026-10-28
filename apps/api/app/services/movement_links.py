"""Kasa/banka hareketi ↔ kredi taksiti / masraf bağlarının güvenliği.

SQLite tablolarında AUTOINCREMENT yok ve FK (ON DELETE SET NULL) zorlanmıyor:
en büyük id'li hareket silinince aynı id bir sonraki kayda (ör. bir kapora
tahsilatına) yeniden verilir; eski taksit / masraf bağı ise yerinde kalır.
Böyle "bayat" bir bağ üzerinden Düzenle / İptal yapılınca, başka bir kayda ait
hareket silinir (AKBANK "Kapora SIP-2026-003" 1.250 TL kaybı böyle oldu).

Bu modül:
  * bir hareketin gerçekten o taksit / masrafa ait olup olmadığını söyler
    (ait değilse yalnızca bağ koparılır, hareket silinmez);
  * hareket silinirken ona işaret eden tüm bağları temizler.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

LOAN_CATEGORY = "kredi_taksit"
LOAN_NOTE_PREFIX = "Kredi taksit:"
BANK_OUT_TYPES = frozenset({"withdrawal"})
CASH_OUT_TYPES = frozenset({"gider", "odeme"})


def _dec(v: Any) -> Decimal | None:
    if v is None:
        return None
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except Exception:  # noqa: BLE001
        return None


def _g(obj: Any, name: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def loan_movement_ok(kind: str, inst: Any, mov: Any, *, sharers: int = 1, expense_refs: int = 0) -> tuple[bool, str]:
    """Is ``mov`` the kasa/banka leg that this installment payment created?"""
    if mov is None:
        return False, "hareket yok"
    mtype = _g(mov, "movement_type") or ""
    if kind == "bank":
        if mtype not in BANK_OUT_TYPES:
            return False, f"tip {mtype}"
        acc = _g(inst, "bank_account_id")
        if acc and _g(mov, "bank_account_id") != acc:
            return False, "hesap farklı"
    else:
        if mtype not in CASH_OUT_TYPES:
            return False, f"tip {mtype}"
        reg = _g(inst, "cash_register_id")
        if reg and _g(mov, "cash_register_id") != reg:
            return False, "kasa farklı"
    if _g(mov, "transfer_group_id"):
        return False, "virman bacağı"
    note = (_g(mov, "note") or "").strip()
    if (_g(mov, "category") or "") != LOAN_CATEGORY and not note.startswith(LOAN_NOTE_PREFIX):
        return False, "kredi taksit hareketi değil"
    seq = _g(inst, "sequence")
    if note.startswith(LOAN_NOTE_PREFIX) and seq is not None:
        nums = re.findall(r"#(\d+)", note.split(" — ", 1)[0])
        if nums and int(nums[-1]) != int(seq):
            return False, f"başka taksit (#{nums[-1]})"
    if expense_refs:
        return False, "masrafa bağlı"
    if sharers > 1:
        return False, "birden fazla taksit aynı harekete bağlı"
    return True, ""


def expense_movement_ok(
    kind: str,
    expense: Any,
    mov: Any,
    *,
    sharer_amounts: list[Any] | None = None,
    loan_refs: int = 0,
) -> tuple[bool, str]:
    """Is ``mov`` the kasa/banka outflow posted for this expense?

    ``sharer_amounts``: amounts of *all* expenses linked to the same movement
    (including this one). When several share it, only the single one whose
    amount equals the movement amount owns it.
    """
    if mov is None:
        return False, "hareket yok"
    mtype = _g(mov, "movement_type") or ""
    if kind == "bank":
        if mtype not in BANK_OUT_TYPES:
            return False, f"tip {mtype}"
        acc = _g(expense, "bank_account_id")
        if acc and _g(mov, "bank_account_id") != acc:
            return False, "hesap farklı"
    else:
        if mtype not in CASH_OUT_TYPES:
            return False, f"tip {mtype}"
        reg = _g(expense, "cash_register_id")
        if reg and _g(mov, "cash_register_id") != reg:
            return False, "kasa farklı"
    if _g(mov, "transfer_group_id"):
        return False, "virman bacağı"
    if loan_refs:
        return False, "kredi taksitine bağlı"
    note = (_g(mov, "note") or "").strip()
    if (_g(mov, "category") or "") == LOAN_CATEGORY or note.startswith(LOAN_NOTE_PREFIX):
        return False, "kredi taksit hareketi"
    amts = sharer_amounts or []
    if len(amts) > 1:
        mamt = _dec(_g(mov, "amount"))
        matching = [a for a in amts if _dec(a) == mamt]
        if len(matching) != 1 or _dec(_g(expense, "amount")) != mamt:
            return False, "birden fazla masraf aynı harekete bağlı"
    return True, ""


# ---------------------------------------------------------------- ORM helpers


def _models():
    from app.models.expense import Expense
    from app.models.finance import BankMovement, CashMovement
    from app.models.loan import LoanInstallment

    return Expense, BankMovement, CashMovement, LoanInstallment


def owned_loan_movement(db, inst, kind: str):
    """Return the movement only if it really belongs to ``inst``; else None."""
    Expense, BankMovement, CashMovement, LoanInstallment = _models()
    mid = inst.bank_movement_id if kind == "bank" else inst.cash_movement_id
    if not mid:
        return None
    Model = BankMovement if kind == "bank" else CashMovement
    mov = db.get(Model, mid)
    lcol = LoanInstallment.bank_movement_id if kind == "bank" else LoanInstallment.cash_movement_id
    ecol = Expense.bank_movement_id if kind == "bank" else Expense.cash_movement_id
    sharers = db.query(LoanInstallment.id).filter(lcol == mid).count()
    exp_refs = db.query(Expense.id).filter(ecol == mid).count()
    ok, _why = loan_movement_ok(kind, inst, mov, sharers=sharers, expense_refs=exp_refs)
    return mov if ok else None


def owned_expense_movement(db, expense, kind: str):
    Expense, BankMovement, CashMovement, LoanInstallment = _models()
    mid = expense.bank_movement_id if kind == "bank" else expense.cash_movement_id
    if not mid:
        return None
    Model = BankMovement if kind == "bank" else CashMovement
    mov = db.get(Model, mid)
    lcol = LoanInstallment.bank_movement_id if kind == "bank" else LoanInstallment.cash_movement_id
    ecol = Expense.bank_movement_id if kind == "bank" else Expense.cash_movement_id
    amts = [r[0] for r in db.query(Expense.amount).filter(ecol == mid).all()]
    loan_refs = db.query(LoanInstallment.id).filter(lcol == mid).count()
    ok, _why = expense_movement_ok(kind, expense, mov, sharer_amounts=amts, loan_refs=loan_refs)
    return mov if ok else None


def movement_is_referenced(db, kind: str, movement_id: int, *, exclude_expense_id: int | None = None) -> bool:
    Expense, BankMovement, CashMovement, LoanInstallment = _models()
    lcol = LoanInstallment.bank_movement_id if kind == "bank" else LoanInstallment.cash_movement_id
    ecol = Expense.bank_movement_id if kind == "bank" else Expense.cash_movement_id
    if db.query(LoanInstallment.id).filter(lcol == movement_id).first():
        return True
    q = db.query(Expense.id).filter(ecol == movement_id)
    if exclude_expense_id is not None:
        q = q.filter(Expense.id != exclude_expense_id)
    return q.first() is not None


def unlink_loan_refs(db, kind: str, movement_id: int) -> int:
    """Hareket silinirken ona bağlı taksit bağlarını temizle (FK SET NULL yerine)."""
    _e, _b, _c, LoanInstallment = _models()
    lcol = LoanInstallment.bank_movement_id if kind == "bank" else LoanInstallment.cash_movement_id
    rows = db.query(LoanInstallment).filter(lcol == movement_id).all()
    for inst in rows:
        if kind == "bank":
            inst.bank_movement_id = None
        else:
            inst.cash_movement_id = None
    return len(rows)


# ------------------------------------------------- delete hook (FK SET NULL yerine)

_HOOKS_INSTALLED = False


def install_delete_hooks() -> None:
    """Kasa/banka hareketi hangi yoldan silinirse silinsin ona işaret eden
    taksit / masraf bağlarını aynı işlemde NULL yap. SQLite FK zorlamadığı ve
    id yeniden kullanıldığı için bu olmadan bayat bağ kalıyordu."""
    global _HOOKS_INSTALLED
    if _HOOKS_INSTALLED:
        return
    from sqlalchemy import event, text

    from app.models.finance import BankMovement, CashMovement

    def _make(col: str):
        def _before_delete(_mapper, connection, target) -> None:
            mid = getattr(target, "id", None)
            if mid is None:
                return
            connection.execute(
                text(f"UPDATE loan_installments SET {col} = NULL WHERE {col} = :i"), {"i": mid}
            )
            connection.execute(
                text(f"UPDATE expenses SET {col} = NULL WHERE {col} = :i"), {"i": mid}
            )

        return _before_delete

    event.listen(BankMovement, "before_delete", _make("bank_movement_id"))
    event.listen(CashMovement, "before_delete", _make("cash_movement_id"))
    _HOOKS_INSTALLED = True


install_delete_hooks()
