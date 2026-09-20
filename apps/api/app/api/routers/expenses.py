"""Giderler — kategori + kayıt; ödeme sonrası kasa/banka hareketi."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.expense import EXPENSE_PAYMENT_METHODS, Expense, ExpenseCategory
from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister
from app.models.user import User
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryOut,
    ExpenseCreate,
    ExpenseOut,
)

router = APIRouter(prefix="/finance/expenses", tags=["expenses"])

READ = ("admin", "muhasebe")
WRITE = ("admin", "muhasebe")


def _out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id,
        category_id=e.category_id,
        category_name=e.category.name if e.category else None,
        amount=e.amount,
        expense_date=e.expense_date,
        payment_method=e.payment_method,
        note=e.note,
        cash_register_id=e.cash_register_id,
        bank_account_id=e.bank_account_id,
        is_posted=e.is_posted,
        created_by_user_id=e.created_by_user_id,
        created_at=e.created_at,
    )


def post_to_ledger(db: Session, expense: Expense, user: User) -> None:
    if expense.is_posted:
        return
    note = expense.note or (expense.category.name if expense.category else "Gider")
    cat_name = expense.category.name if expense.category else "Gider"
    if expense.payment_method == "nakit":
        reg = (
            db.get(CashRegister, expense.cash_register_id)
            if expense.cash_register_id
            else db.query(CashRegister).filter(CashRegister.is_active.is_(True)).first()
        )
        if not reg:
            raise HTTPException(status_code=400, detail="Aktif kasa bulunamadı")
        mov = CashMovement(
            cash_register_id=reg.id,
            movement_type="gider",
            amount=expense.amount,
            movement_date=expense.expense_date,
            category=cat_name,
            note=note,
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        expense.cash_register_id = reg.id
        expense.cash_movement_id = mov.id
    else:
        acc = (
            db.get(BankAccount, expense.bank_account_id)
            if expense.bank_account_id
            else db.query(BankAccount).filter(BankAccount.is_active.is_(True)).first()
        )
        if not acc:
            raise HTTPException(status_code=400, detail="Aktif banka hesabı bulunamadı")
        mov = BankMovement(
            bank_account_id=acc.id,
            movement_type="withdrawal",
            amount=expense.amount,
            movement_date=expense.expense_date,
            category=cat_name,
            note=note,
            created_by_user_id=user.id,
        )
        db.add(mov)
        db.flush()
        expense.bank_account_id = acc.id
        expense.bank_movement_id = mov.id
    expense.is_posted = True


@router.get("/categories", response_model=list[ExpenseCategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[ExpenseCategoryOut]:
    rows = db.query(ExpenseCategory).order_by(ExpenseCategory.name).all()
    return [ExpenseCategoryOut.model_validate(r) for r in rows]


@router.post("/categories", response_model=ExpenseCategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> ExpenseCategoryOut:
    if db.query(ExpenseCategory).filter(ExpenseCategory.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Kategori zaten var")
    row = ExpenseCategory(name=payload.name, description=payload.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return ExpenseCategoryOut.model_validate(row)


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
    category_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[ExpenseOut]:
    q = db.query(Expense).options(joinedload(Expense.category))
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    rows = q.order_by(Expense.expense_date.desc(), Expense.id.desc()).offset(skip).limit(limit).all()
    return [_out(r) for r in rows]


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> ExpenseOut:
    cat = db.get(ExpenseCategory, payload.category_id)
    if not cat or not cat.is_active:
        raise HTTPException(status_code=400, detail="Gider kategorisi bulunamadı")
    if payload.payment_method not in EXPENSE_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Geçersiz ödeme yöntemi")
    expense = Expense(
        category_id=payload.category_id,
        amount=Decimal(str(payload.amount)),
        expense_date=payload.expense_date,
        payment_method=payload.payment_method,
        note=payload.note,
        cash_register_id=payload.cash_register_id,
        bank_account_id=payload.bank_account_id,
        created_by_user_id=user.id,
    )
    db.add(expense)
    db.flush()
    if payload.post_immediately:
        post_to_ledger(db, expense, user)
    db.commit()
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense.id)
        .first()
    )
    return _out(expense)


@router.post("/{expense_id}/post", response_model=ExpenseOut)
def post_expense_endpoint(
    expense_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> ExpenseOut:
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if expense.is_posted:
        return _out(expense)
    post_to_ledger(db, expense, user)
    db.commit()
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense_id)
        .first()
    )
    return _out(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if expense.is_posted:
        raise HTTPException(status_code=400, detail="İşlenmiş gider silinemez")
    db.delete(expense)
    db.commit()
