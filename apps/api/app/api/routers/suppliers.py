"""Suppliers CRUD + payable ledger (ekstre / borçlar)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.supplier import (
    SUPPLIER_MOVEMENT_TYPES,
    Purchase,
    Supplier,
    SupplierMovement,
)
from app.models.user import User
from app.schemas.supplier import (
    PayableItem,
    SupplierCreate,
    SupplierDetailOut,
    SupplierMovementCreate,
    SupplierMovementOut,
    SupplierOut,
    SupplierPurchaseBrief,
    SupplierStatementOut,
    SupplierUpdate,
)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

READ_ROLES = ("admin", "üretim", "muhasebe", "satış")
WRITE_ROLES = ("admin", "üretim", "muhasebe")
LEDGER_WRITE_ROLES = ("admin", "muhasebe")


def _balance_for(db: Session, supplier: Supplier) -> Decimal:
    row = (
        db.query(
            func.coalesce(func.sum(SupplierMovement.debit), 0),
            func.coalesce(func.sum(SupplierMovement.credit), 0),
        )
        .filter(SupplierMovement.supplier_id == supplier.id)
        .one()
    )
    debit_sum = Decimal(str(row[0]))
    credit_sum = Decimal(str(row[1]))
    opening = supplier.opening_balance or Decimal("0")
    return opening + debit_sum - credit_sum


def _balances_map(db: Session, supplier_ids: list[int]) -> dict[int, tuple[Decimal, Decimal]]:
    if not supplier_ids:
        return {}
    rows = (
        db.query(
            SupplierMovement.supplier_id,
            func.coalesce(func.sum(SupplierMovement.debit), 0),
            func.coalesce(func.sum(SupplierMovement.credit), 0),
        )
        .filter(SupplierMovement.supplier_id.in_(supplier_ids))
        .group_by(SupplierMovement.supplier_id)
        .all()
    )
    return {r[0]: (Decimal(str(r[1])), Decimal(str(r[2]))) for r in rows}


def _supplier_out(supplier: Supplier, balance: Decimal) -> SupplierOut:
    return SupplierOut(
        id=supplier.id,
        code=supplier.code,
        name=supplier.name,
        email=supplier.email,
        phone=supplier.phone,
        city=supplier.city,
        address=supplier.address,
        tax_number=supplier.tax_number,
        tax_office=supplier.tax_office,
        notes=supplier.notes,
        is_active=bool(supplier.is_active),
        opening_balance=supplier.opening_balance or Decimal("0"),
        balance=balance,
        created_at=supplier.created_at,
        updated_at=supplier.updated_at,
    )


def _movement_out(m: SupplierMovement, running: Decimal | None = None) -> SupplierMovementOut:
    purchase_number = None
    if m.purchase is not None:
        purchase_number = m.purchase.purchase_number
    return SupplierMovementOut(
        id=m.id,
        supplier_id=m.supplier_id,
        movement_type=m.movement_type,
        debit=m.debit or Decimal("0"),
        credit=m.credit or Decimal("0"),
        movement_date=m.movement_date,
        purchase_id=m.purchase_id,
        purchase_number=purchase_number,
        note=m.note,
        created_at=m.created_at,
        running_balance=running,
    )


def _split_amount(movement_type: str, amount: Decimal, side: str | None) -> tuple[Decimal, Decimal]:
    if movement_type == "purchase":
        return amount, Decimal("0")
    if movement_type == "payment":
        return Decimal("0"), amount
    if side == "credit":
        return Decimal("0"), amount
    return amount, Decimal("0")


@router.get("", response_model=list[SupplierOut])
def list_suppliers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    q: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    has_balance: bool | None = Query(default=None),
    skip: int = 0,
    limit: int = 200,
) -> list[SupplierOut]:
    query = db.query(Supplier)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Supplier.name.ilike(like),
                Supplier.email.ilike(like),
                Supplier.phone.ilike(like),
                Supplier.code.ilike(like),
                Supplier.tax_number.ilike(like),
                Supplier.city.ilike(like),
            )
        )
    if active is not None:
        query = query.filter(Supplier.is_active.is_(active))
    suppliers = query.order_by(Supplier.name.asc()).offset(skip).limit(limit).all()
    bal_map = _balances_map(db, [s.id for s in suppliers])
    result: list[SupplierOut] = []
    for s in suppliers:
        debit_s, credit_s = bal_map.get(s.id, (Decimal("0"), Decimal("0")))
        balance = (s.opening_balance or Decimal("0")) + debit_s - credit_s
        if has_balance is True and balance <= 0:
            continue
        if has_balance is False and balance > 0:
            continue
        result.append(_supplier_out(s, balance))
    return result


@router.get("/payables", response_model=list[PayableItem])
def open_payables(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[PayableItem]:
    suppliers = db.query(Supplier).filter(Supplier.is_active.is_(True)).order_by(Supplier.name).all()
    bal_map = _balances_map(db, [s.id for s in suppliers])
    last_dates = dict(
        db.query(SupplierMovement.supplier_id, func.max(SupplierMovement.movement_date))
        .group_by(SupplierMovement.supplier_id)
        .all()
    )
    items: list[PayableItem] = []
    for s in suppliers:
        debit_s, credit_s = bal_map.get(s.id, (Decimal("0"), Decimal("0")))
        balance = (s.opening_balance or Decimal("0")) + debit_s - credit_s
        if balance <= 0:
            continue
        items.append(
            PayableItem(
                supplier_id=s.id,
                code=s.code,
                name=s.name,
                phone=s.phone,
                city=s.city,
                balance=balance,
                last_movement_date=last_dates.get(s.id),
            )
        )
    items.sort(key=lambda x: x.balance, reverse=True)
    return items


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> SupplierOut:
    data = payload.model_dump()
    if data.get("code"):
        existing = db.query(Supplier).filter(Supplier.code == data["code"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tedarikçi kodu zaten kullanılıyor")
    supplier = Supplier(**data)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return _supplier_out(supplier, supplier.opening_balance or Decimal("0"))


@router.get("/{supplier_id}", response_model=SupplierDetailOut)
def get_supplier_detail(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SupplierDetailOut:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    balance = _balance_for(db, supplier)
    base = _supplier_out(supplier, balance)

    purchases = (
        db.query(Purchase)
        .filter(Purchase.supplier_id == supplier_id)
        .order_by(Purchase.created_at.desc())
        .limit(10)
        .all()
    )
    recent_purchases = [
        SupplierPurchaseBrief(
            id=p.id,
            purchase_number=p.purchase_number,
            status=p.status,
            total_amount=p.total_amount or Decimal("0"),
            purchase_date=p.purchase_date,
            created_at=p.created_at,
        )
        for p in purchases
    ]

    movements = (
        db.query(SupplierMovement)
        .filter(SupplierMovement.supplier_id == supplier_id)
        .order_by(SupplierMovement.movement_date.desc(), SupplierMovement.id.desc())
        .limit(15)
        .all()
    )
    recent_movements = [_movement_out(m) for m in movements]

    return SupplierDetailOut(
        **base.model_dump(),
        recent_purchases=recent_purchases,
        recent_movements=recent_movements,
    )


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> SupplierOut:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        clash = (
            db.query(Supplier)
            .filter(Supplier.code == data["code"], Supplier.id != supplier_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Tedarikçi kodu zaten kullanılıyor")
    for key, value in data.items():
        setattr(supplier, key, value)
    supplier.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(supplier)
    return _supplier_out(supplier, _balance_for(db, supplier))


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    confirmed = (
        db.query(Purchase)
        .filter(Purchase.supplier_id == supplier_id, Purchase.status == "confirmed")
        .count()
    )
    if confirmed:
        raise HTTPException(
            status_code=400,
            detail="Onaylı satın alma kayıtları olan tedarikçi silinemez",
        )
    db.delete(supplier)
    db.commit()


@router.get("/{supplier_id}/movements", response_model=list[SupplierMovementOut])
def list_movements(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    skip: int = 0,
    limit: int = 200,
) -> list[SupplierMovementOut]:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    rows = (
        db.query(SupplierMovement)
        .filter(SupplierMovement.supplier_id == supplier_id)
        .order_by(SupplierMovement.movement_date.desc(), SupplierMovement.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_movement_out(m) for m in rows]


@router.post(
    "/{supplier_id}/movements",
    response_model=SupplierMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def create_movement(
    supplier_id: int,
    payload: SupplierMovementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*LEDGER_WRITE_ROLES)),
) -> SupplierMovementOut:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    if payload.movement_type not in SUPPLIER_MOVEMENT_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz hareket tipi")
    if payload.purchase_id is not None:
        purchase = db.get(Purchase, payload.purchase_id)
        if not purchase or purchase.supplier_id != supplier_id:
            raise HTTPException(status_code=400, detail="Satın alma bu tedarikçiye ait değil")
    debit, credit = _split_amount(payload.movement_type, payload.amount, payload.side)
    mov_date = payload.movement_date or date.today()
    movement = SupplierMovement(
        supplier_id=supplier_id,
        movement_type=payload.movement_type,
        debit=debit,
        credit=credit,
        movement_date=mov_date,
        purchase_id=payload.purchase_id,
        note=payload.note,
    )
    db.add(movement)
    db.flush()

    if (
        payload.post_to_finance
        and payload.movement_type == "payment"
        and payload.finance_method
    ):
        from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister

        note = payload.note or f"Tedarikçi ödemesi — #{supplier_id} {supplier.name}"
        if payload.finance_method == "cash":
            reg = (
                db.query(CashRegister)
                .filter(CashRegister.is_active.is_(True))
                .order_by(CashRegister.id.asc())
                .first()
            )
            if reg:
                db.add(
                    CashMovement(
                        cash_register_id=reg.id,
                        movement_type="odeme",
                        amount=payload.amount,
                        movement_date=mov_date,
                        category="Tedarikçi",
                        note=note,
                        supplier_id=supplier_id,
                        supplier_movement_id=movement.id,
                        created_by_user_id=user.id,
                    )
                )
        elif payload.finance_method == "bank":
            if not payload.bank_account_id:
                raise HTTPException(status_code=400, detail="Banka hesabı seçilmedi")
            acc = db.get(BankAccount, payload.bank_account_id)
            if not acc or not acc.is_active:
                raise HTTPException(status_code=400, detail="Banka hesabı bulunamadı")
            db.add(
                BankMovement(
                    bank_account_id=acc.id,
                    movement_type="withdrawal",
                    amount=payload.amount,
                    movement_date=mov_date,
                    category="Tedarikçi",
                    note=note,
                    supplier_id=supplier_id,
                    supplier_movement_id=movement.id,
                    created_by_user_id=user.id,
                )
            )

    db.commit()
    db.refresh(movement)
    return _movement_out(movement)


@router.get("/{supplier_id}/statement", response_model=SupplierStatementOut)
def supplier_statement(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> SupplierStatementOut:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")

    query = db.query(SupplierMovement).filter(SupplierMovement.supplier_id == supplier_id)
    if from_date:
        query = query.filter(SupplierMovement.movement_date >= from_date)
    if to_date:
        query = query.filter(SupplierMovement.movement_date <= to_date)
    rows = query.order_by(SupplierMovement.movement_date.asc(), SupplierMovement.id.asc()).all()

    running = supplier.opening_balance or Decimal("0")
    if from_date:
        prior = (
            db.query(
                func.coalesce(func.sum(SupplierMovement.debit), 0),
                func.coalesce(func.sum(SupplierMovement.credit), 0),
            )
            .filter(
                SupplierMovement.supplier_id == supplier_id,
                SupplierMovement.movement_date < from_date,
            )
            .one()
        )
        running = running + Decimal(str(prior[0])) - Decimal(str(prior[1]))

    opening = running
    out_rows: list[SupplierMovementOut] = []
    for m in rows:
        running = running + (m.debit or Decimal("0")) - (m.credit or Decimal("0"))
        out_rows.append(_movement_out(m, running))

    return SupplierStatementOut(
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        opening_balance=opening,
        closing_balance=running,
        movements=out_rows,
    )


@router.get("/{supplier_id}/voucher-pdf")
def supplier_voucher_pdf(
    supplier_id: int,
    tip: str = Query(default="Alacak Fişi"),
    amount: float = Query(default=0),
    fis_date: str | None = Query(default=None, alias="date"),
    due: str | None = Query(default=None),
    note: str | None = Query(default=None),
    movement_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
):
    """Basit borç/alacak fişi PDF (masaüstü twin stil değil)."""
    from fastapi.responses import Response
    from app.models.settings_model import AppSetting
    from app.services.pdf import build_supplier_voucher_pdf

    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")

    tip_out = tip
    amount_out = Decimal(str(amount or 0))
    date_out = fis_date or date.today().isoformat()
    due_out = due or ""
    note_out = note or ""

    if movement_id:
        mov = db.get(SupplierMovement, movement_id)
        if mov and mov.supplier_id == supplier_id:
            tip_out = "Alacak Fişi" if (mov.debit or 0) > 0 else "Borç Fişi"
            amount_out = mov.debit or mov.credit or Decimal("0")
            date_out = mov.movement_date.isoformat() if mov.movement_date else date_out
            note_out = mov.note or note_out

    rows = {s.key: (s.value or "") for s in db.query(AppSetting).all()}
    settings = {
        "company_name": rows.get("company_name", "Baykuş Baskı"),
        "phone": rows.get("phone", ""),
        "email": rows.get("email", rows.get("company_email", "")),
        "address": rows.get("address", rows.get("adres", "")),
        "logo_dosyasi": rows.get("logo_dosyasi", ""),
        "form_logo_dosyasi": rows.get("form_logo_dosyasi", ""),
    }
    pdf_bytes = build_supplier_voucher_pdf(
        supplier.name, tip_out, amount_out, date_out, due_out, note_out, settings
    )
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in supplier.name)[:40]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fis-{safe}.pdf"'},
    )

