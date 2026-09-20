"""Kredi / taksit — loans + installment payments with optional cash/bank post."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal


def _add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister
from app.models.loan import DEFAULT_LOAN_STATUS, Loan, LoanInstallment
from app.models.user import User
from app.schemas.loan import (
    LoanCreate,
    LoanInstallmentPay,
    LoanListItem,
    LoanOut,
    LoanUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/loans", tags=["loans"])


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def _stats(loan: Loan) -> tuple[int, int, Decimal, Decimal]:
    paid_c = unpaid_c = 0
    paid_a = remaining = Decimal("0")
    for inst in loan.installments or []:
        amt = _d(inst.amount)
        if inst.is_paid:
            paid_c += 1
            paid_a += amt
        else:
            unpaid_c += 1
            remaining += amt
    return paid_c, unpaid_c, paid_a, remaining


def _to_list(loan: Loan) -> LoanListItem:
    paid_c, unpaid_c, paid_a, remaining = _stats(loan)
    return LoanListItem(
        id=loan.id,
        title=loan.title,
        lender=loan.lender,
        principal_amount=_d(loan.principal_amount),
        interest_rate=loan.interest_rate,
        start_date=loan.start_date,
        installment_count=loan.installment_count,
        status=loan.status,
        notes=loan.notes,
        paid_count=paid_c,
        unpaid_count=unpaid_c,
        paid_amount=paid_a,
        remaining_amount=remaining,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
    )


def _to_out(loan: Loan) -> LoanOut:
    return LoanOut(**_to_list(loan).model_dump(), installments=loan.installments or [])


def _load(db: Session, loan_id: int) -> Loan:
    loan = (
        db.query(Loan)
        .options(joinedload(Loan.installments))
        .filter(Loan.id == loan_id)
        .first()
    )
    if not loan:
        raise HTTPException(status_code=404, detail="Kredi / taksit bulunamadı")
    return loan


def _build_installments(
    principal: Decimal,
    count: int,
    start: date,
    rate: Decimal | None,
) -> list[LoanInstallment]:
    """Equal principal installments; optional simple interest added to each."""
    count = max(1, count)
    base = (principal / Decimal(count)).quantize(Decimal("0.01"))
    interest_total = Decimal("0")
    if rate is not None and rate > 0:
        # Simple annual-ish rate applied once over principal, split equally
        interest_total = (principal * rate / Decimal("100")).quantize(Decimal("0.01"))
    interest_each = (interest_total / Decimal(count)).quantize(Decimal("0.01")) if interest_total else Decimal("0")
    items: list[LoanInstallment] = []
    allocated = Decimal("0")
    for i in range(1, count + 1):
        if i == count:
            amt = principal - allocated + interest_each
        else:
            amt = base + interest_each
            allocated += base
        due = _add_months(start, i - 1)
        items.append(
            LoanInstallment(
                sequence=i,
                due_date=due,
                amount=amt,
                is_paid=False,
            )
        )
    return items


@router.get("", response_model=list[LoanListItem])
def list_loans(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "muhasebe")),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[LoanListItem]:
    q = db.query(Loan).options(joinedload(Loan.installments))
    if status_filter:
        q = q.filter(Loan.status == status_filter)
    rows = q.order_by(Loan.id.desc()).all()
    return [_to_list(r) for r in rows]


@router.post("", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
def create_loan(
    payload: LoanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    loan = Loan(
        title=payload.title.strip(),
        lender=payload.lender,
        principal_amount=_d(payload.principal_amount),
        interest_rate=payload.interest_rate,
        start_date=payload.start_date,
        installment_count=payload.installment_count,
        status=payload.status or DEFAULT_LOAN_STATUS,
        notes=payload.notes,
    )
    db.add(loan)
    db.flush()
    for inst in _build_installments(
        _d(payload.principal_amount),
        payload.installment_count,
        payload.start_date,
        payload.interest_rate,
    ):
        loan.installments.append(inst)
    db.commit()
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="loan",
        entity_id=loan.id,
        detail={"title": loan.title, "principal": str(loan.principal_amount)},
    )
    return _to_out(_load(db, loan.id))


@router.get("/{loan_id}", response_model=LoanOut)
def get_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    return _to_out(_load(db, loan_id))


@router.put("/{loan_id}", response_model=LoanOut)
def update_loan(
    loan_id: int,
    payload: LoanUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    loan = _load(db, loan_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(loan, k, v)
    loan.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="loan",
        entity_id=loan.id,
        detail=data,
    )
    return _to_out(_load(db, loan.id))


@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> None:
    loan = _load(db, loan_id)
    title = loan.title
    db.delete(loan)
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="loan",
        entity_id=loan_id,
        detail={"title": title},
    )


@router.post("/{loan_id}/installments/{installment_id}/pay", response_model=LoanOut)
def pay_installment(
    loan_id: int,
    installment_id: int,
    payload: LoanInstallmentPay,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    loan = _load(db, loan_id)
    inst = next((i for i in loan.installments if i.id == installment_id), None)
    if not inst:
        raise HTTPException(status_code=404, detail="Taksit bulunamadı")
    if inst.is_paid:
        raise HTTPException(status_code=400, detail="Taksit zaten ödenmiş")

    today = date.today()
    cash_mov_id = None
    bank_mov_id = None

    if payload.post_finance and payload.payment_method == "nakit":
        reg_id = payload.cash_register_id
        if not reg_id:
            reg = db.query(CashRegister).filter(CashRegister.is_active.is_(True)).first()
            reg_id = reg.id if reg else None
        if not reg_id or not db.get(CashRegister, reg_id):
            raise HTTPException(status_code=400, detail="Kasa bulunamadı")
        mov = CashMovement(
            cash_register_id=reg_id,
            movement_type="odeme",
            amount=_d(inst.amount),
            movement_date=today,
            category="kredi_taksit",
            note=f"Kredi taksit: {loan.title} #{inst.sequence}"
            + (f" — {payload.notes}" if payload.notes else ""),
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        cash_mov_id = mov.id
        inst.cash_register_id = reg_id
    elif payload.post_finance and payload.payment_method == "banka":
        acc_id = payload.bank_account_id
        if not acc_id:
            acc = db.query(BankAccount).filter(BankAccount.is_active.is_(True)).first()
            acc_id = acc.id if acc else None
        if not acc_id or not db.get(BankAccount, acc_id):
            raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı")
        mov = BankMovement(
            bank_account_id=acc_id,
            movement_type="withdrawal",
            amount=_d(inst.amount),
            movement_date=today,
            category="kredi_taksit",
            note=f"Kredi taksit: {loan.title} #{inst.sequence}"
            + (f" — {payload.notes}" if payload.notes else ""),
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        bank_mov_id = mov.id
        inst.bank_account_id = acc_id

    inst.is_paid = True
    inst.paid_at = datetime.utcnow()
    inst.payment_method = payload.payment_method
    inst.cash_movement_id = cash_mov_id
    inst.bank_movement_id = bank_mov_id
    if payload.notes:
        inst.notes = payload.notes

    # Auto-close loan when all paid
    if all(i.is_paid for i in loan.installments):
        loan.status = "kapandı"
    loan.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="loan_installment",
        entity_id=inst.id,
        detail={
            "loan_id": loan_id,
            "sequence": inst.sequence,
            "amount": str(inst.amount),
            "method": payload.payment_method,
        },
    )
    return _to_out(_load(db, loan.id))
