"""Giderler — kategori + kayıt; ödeme sonrası kasa/banka hareketi."""

from __future__ import annotations

from datetime import date
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
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseOut,
)

BH_IMPORT_MARKER = "BH_IMPORT:"

router = APIRouter(prefix="/finance/expenses", tags=["expenses"])

READ = ("admin", "muhasebe")
WRITE = ("admin", "muhasebe")


def _status_label(e: Expense) -> str:
    if getattr(e, "is_cancelled", False):
        return "İptal"
    if e.is_posted:
        return "Ödenmiş"
    from datetime import date as _date
    if e.due_date and e.due_date < _date.today():
        return "Gecikmiş"
    return "Ödenecek"


def _is_bh_expense(e: Expense) -> bool:
    note = e.note or ""
    return BH_IMPORT_MARKER in note


def _refuse_bh_expense(e: Expense) -> None:
    if _is_bh_expense(e):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BizimHesap aktarım masrafları iptal edilemez",
        )


def _purge_expense_ledger(db: Session, expense: Expense) -> None:
    """Remove linked kasa/banka movements (and their party legs if any)."""
    from app.models.customer import CariMovement
    from app.models.supplier import SupplierMovement

    if expense.cash_movement_id:
        mov = db.get(CashMovement, expense.cash_movement_id)
        if mov:
            if mov.cari_movement_id:
                cm = db.get(CariMovement, mov.cari_movement_id)
                if cm:
                    db.delete(cm)
            if mov.supplier_movement_id:
                sm = db.get(SupplierMovement, mov.supplier_movement_id)
                if sm:
                    db.delete(sm)
            db.delete(mov)
        expense.cash_movement_id = None
    if expense.bank_movement_id:
        mov = db.get(BankMovement, expense.bank_movement_id)
        if mov:
            if mov.cari_movement_id:
                cm = db.get(CariMovement, mov.cari_movement_id)
                if cm:
                    db.delete(cm)
            if mov.supplier_movement_id:
                sm = db.get(SupplierMovement, mov.supplier_movement_id)
                if sm:
                    db.delete(sm)
            db.delete(mov)
        expense.bank_movement_id = None


def _account_names(db: Session, e: Expense) -> tuple[str | None, str | None]:
    cash_name = None
    bank_name = None
    if e.cash_register_id:
        reg = db.get(CashRegister, e.cash_register_id)
        cash_name = reg.name if reg else None
    if e.bank_account_id:
        acc = db.get(BankAccount, e.bank_account_id)
        bank_name = acc.name if acc else None
    return cash_name, bank_name


def _out(e: Expense, db: Session | None = None) -> ExpenseOut:
    cash_name = None
    bank_name = None
    if db is not None:
        cash_name, bank_name = _account_names(db, e)
    return ExpenseOut(
        id=e.id,
        category_id=e.category_id,
        category_name=e.category.name if e.category else None,
        category_group_name=(e.category.group_name if e.category else None),
        amount=e.amount,
        expense_date=e.expense_date,
        due_date=getattr(e, "due_date", None),
        document_no=getattr(e, "document_no", None),
        payment_method=e.payment_method,
        note=e.note,
        cash_register_id=e.cash_register_id,
        cash_register_name=cash_name,
        bank_account_id=e.bank_account_id,
        bank_account_name=bank_name,
        is_posted=e.is_posted,
        is_cancelled=bool(getattr(e, "is_cancelled", False)),
        status_label=_status_label(e),
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
        if not expense.bank_account_id:
            raise HTTPException(status_code=400, detail="Banka hesabı seçilmelidir")
        acc = db.get(BankAccount, expense.bank_account_id)
        if not acc or not acc.is_active:
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
    rows = (
        db.query(ExpenseCategory)
        .order_by(ExpenseCategory.group_name.asc(), ExpenseCategory.name.asc())
        .all()
    )
    return [ExpenseCategoryOut.model_validate(r) for r in rows]


@router.post("/categories", response_model=ExpenseCategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> ExpenseCategoryOut:
    if db.query(ExpenseCategory).filter(ExpenseCategory.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Kategori zaten var")
    row = ExpenseCategory(
        name=payload.name,
        group_name=payload.group_name or "İşletme Giderleri",
        description=payload.description,
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ExpenseCategoryOut.model_validate(row)


@router.put("/categories/{category_id}", response_model=ExpenseCategoryOut)
def update_category(
    category_id: int,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> ExpenseCategoryOut:
    row = db.get(ExpenseCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı")
    if payload.name is not None:
        dup = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.name == payload.name, ExpenseCategory.id != category_id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="Aynı isimde kalem var")
        row.name = payload.name
    if payload.group_name is not None:
        row.group_name = payload.group_name
    if payload.description is not None:
        row.description = payload.description
    if payload.is_active is not None:
        row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return ExpenseCategoryOut.model_validate(row)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(ExpenseCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı")
    used = db.query(Expense).filter(Expense.category_id == category_id).count()
    if used:
        raise HTTPException(status_code=400, detail=f"Kalem kullanımda ({used} masraf) — pasifleştirin")
    db.delete(row)
    db.commit()


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status_filter: str | None = None,
    q: str | None = None,
    include_cancelled: bool = False,
    skip: int = 0,
    limit: int = 2000,
) -> list[ExpenseOut]:
    query = db.query(Expense).options(joinedload(Expense.category))
    if not include_cancelled:
        query = query.filter(Expense.is_cancelled.is_(False))
    if category_id:
        query = query.filter(Expense.category_id == category_id)
    if date_from:
        query = query.filter(Expense.expense_date >= date_from)
    if date_to:
        query = query.filter(Expense.expense_date <= date_to)
    rows = query.order_by(Expense.expense_date.desc(), Expense.id.desc()).offset(skip).limit(limit).all()
    out = [_out(r, db) for r in rows]
    if status_filter and status_filter != "Tümü":
        out = [r for r in out if r.status_label == status_filter]
    if q:
        needle = q.strip().casefold()
        out = [
            r
            for r in out
            if needle
            in " ".join(
                [
                    str(r.category_name or ""),
                    str(r.category_group_name or ""),
                    str(r.note or ""),
                    str(r.document_no or ""),
                    str(r.payment_method or ""),
                    str(r.cash_register_name or ""),
                    str(r.bank_account_name or ""),
                ]
            ).casefold()
        ]
    return out


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
    cash_register_id = payload.cash_register_id
    bank_account_id = payload.bank_account_id
    if payload.payment_method == "nakit":
        bank_account_id = None
        if cash_register_id:
            reg = db.get(CashRegister, cash_register_id)
            if not reg or not reg.is_active:
                raise HTTPException(status_code=400, detail="Kasa bulunamadı")
    else:
        cash_register_id = None
        if not bank_account_id:
            raise HTTPException(status_code=400, detail="Banka hesabı seçilmelidir")
        acc = db.get(BankAccount, bank_account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı")
    expense = Expense(
        category_id=payload.category_id,
        amount=Decimal(str(payload.amount)),
        expense_date=payload.expense_date,
        due_date=payload.due_date,
        document_no=(payload.document_no.strip() if payload.document_no else None),
        payment_method=payload.payment_method,
        note=payload.note,
        cash_register_id=cash_register_id,
        bank_account_id=bank_account_id,
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
    return _out(expense, db)


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
    if getattr(expense, "is_cancelled", False):
        raise HTTPException(status_code=400, detail="İptal edilmiş masraf işlenemez")
    if expense.is_posted:
        return _out(expense, db)
    post_to_ledger(db, expense, user)
    db.commit()
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense_id)
        .first()
    )
    return _out(expense, db)


@router.post("/{expense_id}/cancel", response_model=ExpenseOut)
def cancel_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> ExpenseOut:
    """İptal: kasa/banka (+bağlı cari) tersine, masraf soft-delete (is_cancelled)."""
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if getattr(expense, "is_cancelled", False):
        raise HTTPException(status_code=400, detail="Zaten iptal edilmiş")
    _refuse_bh_expense(expense)
    if expense.is_posted:
        _purge_expense_ledger(db, expense)
        expense.is_posted = False
    expense.is_cancelled = True
    db.commit()
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.id == expense_id)
        .first()
    )
    return _out(expense, db)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    """Hard delete only for unposted, non-cancelled drafts. Posted → use /cancel."""
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    if getattr(expense, "is_cancelled", False):
        # Already soft-cancelled — allow hard remove of the stub row
        db.delete(expense)
        db.commit()
        return
    if expense.is_posted:
        raise HTTPException(
            status_code=400,
            detail="İşlenmiş gider silinemez — İptal kullanın",
        )
    _refuse_bh_expense(expense)
    db.delete(expense)
    db.commit()
