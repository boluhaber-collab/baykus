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
    LoanInstallmentOut,
    LoanInstallmentPay,
    LoanInstallmentUpdate,
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
    today = date.today()
    this_month = Decimal("0")
    next_due = None
    overdue = 0
    for inst in loan.installments or []:
        if inst.is_paid:
            continue
        due = inst.due_date
        amt = _d(inst.amount)
        if due:
            if due.year == today.year and due.month == today.month:
                this_month += amt
            if due < today:
                overdue += 1
            if next_due is None or due < next_due:
                next_due = due
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
        this_month_due=this_month,
        next_due_date=next_due,
        overdue_count=overdue,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
    )


def _installment_out(db: Session, inst: LoanInstallment) -> LoanInstallmentOut:
    cash_name = None
    bank_name = None
    if inst.cash_register_id:
        reg = db.get(CashRegister, inst.cash_register_id)
        cash_name = reg.name if reg else None
    if inst.bank_account_id:
        acc = db.get(BankAccount, inst.bank_account_id)
        bank_name = acc.name if acc else None
    return LoanInstallmentOut(
        id=inst.id,
        loan_id=inst.loan_id,
        sequence=inst.sequence,
        due_date=inst.due_date,
        amount=_d(inst.amount),
        is_paid=bool(inst.is_paid),
        paid_at=inst.paid_at,
        payment_method=inst.payment_method,
        cash_register_id=inst.cash_register_id,
        cash_register_name=cash_name,
        bank_account_id=inst.bank_account_id,
        bank_account_name=bank_name,
        notes=inst.notes,
    )


def _to_out(db: Session, loan: Loan) -> LoanOut:
    return LoanOut(
        **_to_list(loan).model_dump(),
        installments=[_installment_out(db, i) for i in (loan.installments or [])],
    )


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


def _get_inst(loan: Loan, installment_id: int) -> LoanInstallment:
    inst = next((i for i in loan.installments if i.id == installment_id), None)
    if not inst:
        raise HTTPException(status_code=404, detail="Taksit bulunamadı")
    return inst


def _refuse_bh(loan: Loan, inst: LoanInstallment) -> None:
    blob = f"{loan.notes or ''}\n{inst.notes or ''}"
    if "BH_IMPORT:" in blob or "BH_PLAN:" in blob:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BizimHesap aktarım kayıtları düzenlenemez / iptal edilemez",
        )


def _reverse_finance(db: Session, inst: LoanInstallment) -> None:
    """Delete linked kasa/banka movements for this installment payment."""
    if inst.cash_movement_id:
        mov = db.get(CashMovement, inst.cash_movement_id)
        if mov:
            db.delete(mov)
        inst.cash_movement_id = None
    if inst.bank_movement_id:
        mov = db.get(BankMovement, inst.bank_movement_id)
        if mov:
            db.delete(mov)
        inst.bank_movement_id = None


def _post_finance(
    db: Session,
    loan: Loan,
    inst: LoanInstallment,
    user: User,
    *,
    payment_method: str,
    cash_register_id: int | None,
    bank_account_id: int | None,
    notes: str | None,
    post_finance: bool,
) -> None:
    """Create cash/bank outflow for a paid installment; sets inst account + movement ids."""
    today = date.today()
    cash_mov_id = None
    bank_mov_id = None
    inst.cash_register_id = None
    inst.bank_account_id = None

    if post_finance and payment_method == "nakit":
        if not cash_register_id:
            raise HTTPException(status_code=400, detail="Kasa seçilmelidir")
        reg = db.get(CashRegister, cash_register_id)
        if not reg or not reg.is_active:
            raise HTTPException(status_code=400, detail="Kasa bulunamadı")
        mov = CashMovement(
            cash_register_id=reg.id,
            movement_type="odeme",
            amount=_d(inst.amount),
            movement_date=today,
            category="kredi_taksit",
            note=f"Kredi taksit: {loan.title} #{inst.sequence}"
            + (f" — {notes}" if notes else ""),
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        cash_mov_id = mov.id
        inst.cash_register_id = reg.id
    elif post_finance and payment_method == "banka":
        if not bank_account_id:
            raise HTTPException(status_code=400, detail="Banka hesabı seçilmelidir")
        acc = db.get(BankAccount, bank_account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı")
        mov = BankMovement(
            bank_account_id=acc.id,
            movement_type="withdrawal",
            amount=_d(inst.amount),
            movement_date=today,
            category="kredi_taksit",
            note=f"Kredi taksit: {loan.title} #{inst.sequence}"
            + (f" — {notes}" if notes else ""),
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        bank_mov_id = mov.id
        inst.bank_account_id = acc.id
    elif payment_method == "banka" and bank_account_id:
        # Mark-only or post_finance false — still record which account if provided
        acc = db.get(BankAccount, bank_account_id)
        if acc:
            inst.bank_account_id = acc.id
    elif payment_method == "nakit" and cash_register_id:
        reg = db.get(CashRegister, cash_register_id)
        if reg:
            inst.cash_register_id = reg.id

    inst.cash_movement_id = cash_mov_id
    inst.bank_movement_id = bank_mov_id


def _refresh_loan_status(loan: Loan) -> None:
    if all(i.is_paid for i in loan.installments):
        loan.status = "kapandı"
    elif loan.status == "kapandı":
        loan.status = "aktif"
    loan.updated_at = datetime.utcnow()


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
    return _to_out(db, _load(db, loan.id))


@router.get("/{loan_id}", response_model=LoanOut)
def get_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    return _to_out(db, _load(db, loan_id))


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
    return _to_out(db, _load(db, loan.id))


@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> None:
    loan = _load(db, loan_id)
    title = loan.title
    # Reverse any posted installment finance before deleting loan/installments
    for inst in list(loan.installments or []):
        _reverse_finance(db, inst)
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
    inst = _get_inst(loan, installment_id)
    if inst.is_paid:
        raise HTTPException(status_code=400, detail="Taksit zaten ödenmiş")

    _post_finance(
        db,
        loan,
        inst,
        user,
        payment_method=payload.payment_method,
        cash_register_id=payload.cash_register_id,
        bank_account_id=payload.bank_account_id,
        notes=payload.notes,
        post_finance=payload.post_finance and payload.payment_method != "none",
    )

    inst.is_paid = True
    inst.paid_at = datetime.utcnow()
    inst.payment_method = payload.payment_method
    if payload.notes:
        inst.notes = payload.notes

    _refresh_loan_status(loan)
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
            "cash_register_id": payload.cash_register_id,
            "bank_account_id": payload.bank_account_id,
            "action": "pay",
        },
    )
    return _to_out(db, _load(db, loan.id))


@router.post("/{loan_id}/installments/{installment_id}/cancel", response_model=LoanOut)
def cancel_installment_payment(
    loan_id: int,
    installment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    """İptal Et — unpay installment and reverse linked kasa/banka movements."""
    loan = _load(db, loan_id)
    inst = _get_inst(loan, installment_id)
    if not inst.is_paid:
        raise HTTPException(status_code=400, detail="Taksit ödenmemiş")
    _refuse_bh(loan, inst)

    _reverse_finance(db, inst)
    inst.is_paid = False
    inst.paid_at = None
    inst.payment_method = None
    inst.cash_register_id = None
    inst.bank_account_id = None

    _refresh_loan_status(loan)
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="loan_installment",
        entity_id=inst.id,
        detail={
            "loan_id": loan_id,
            "sequence": inst.sequence,
            "action": "cancel_payment",
        },
    )
    return _to_out(db, _load(db, loan.id))


@router.put("/{loan_id}/installments/{installment_id}", response_model=LoanOut)
def update_installment(
    loan_id: int,
    installment_id: int,
    payload: LoanInstallmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> LoanOut:
    """Düzenle — plan fields and/or paid payment account with finance cascade reverse."""
    loan = _load(db, loan_id)
    inst = _get_inst(loan, installment_id)
    _refuse_bh(loan, inst)

    data = payload.model_dump(exclude_unset=True)
    if "due_date" in data and data["due_date"] is not None:
        inst.due_date = data["due_date"]
    if "amount" in data and data["amount"] is not None:
        inst.amount = _d(data["amount"])
    if "notes" in data:
        inst.notes = data["notes"]

    # Payment edit (paid rows): reverse old legs then re-post
    payment_touch = any(
        k in data for k in ("payment_method", "cash_register_id", "bank_account_id", "post_finance")
    )
    if payment_touch:
        if not inst.is_paid:
            raise HTTPException(
                status_code=400,
                detail="Ödeme hesabı yalnızca ödenmiş taksitlerde düzenlenebilir",
            )
        method = data.get("payment_method") or inst.payment_method or "banka"
        post_finance = data.get("post_finance", True) and method != "none"
        cash_id = data.get("cash_register_id", inst.cash_register_id)
        bank_id = data.get("bank_account_id", inst.bank_account_id)
        _reverse_finance(db, inst)
        _post_finance(
            db,
            loan,
            inst,
            user,
            payment_method=method,
            cash_register_id=cash_id,
            bank_account_id=bank_id,
            notes=inst.notes,
            post_finance=post_finance,
        )
        inst.payment_method = method
        if method == "none":
            inst.cash_register_id = None
            inst.bank_account_id = None

    # If amount changed on a paid installment that still has finance, refresh movement amounts
    elif inst.is_paid and "amount" in data and data["amount"] is not None:
        if inst.cash_movement_id:
            mov = db.get(CashMovement, inst.cash_movement_id)
            if mov:
                mov.amount = _d(inst.amount)
        if inst.bank_movement_id:
            mov = db.get(BankMovement, inst.bank_movement_id)
            if mov:
                mov.amount = _d(inst.amount)

    _refresh_loan_status(loan)
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="loan_installment",
        entity_id=inst.id,
        detail={
            "loan_id": loan_id,
            "sequence": inst.sequence,
            "action": "edit",
            "fields": {k: str(v) if v is not None else None for k, v in data.items()},
        },
    )
    return _to_out(db, _load(db, loan.id))
