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

from app.utils.bh_note import sanitize_display_note

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


def _ascii_filename(name: str, *, fallback: str = "dosya", max_len: int = 40) -> str:
    """Starlette encodes Content-Disposition as latin-1; keep ASCII only.
    str.isalnum() is True for Turkish letters (Ş/İ/Ğ) which then crash headers.
    """
    raw = "".join(c if (c.isascii() and (c.isalnum() or c in "-_")) else "_" for c in (name or ""))
    raw = raw.strip("_")[:max_len] or fallback
    return raw


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

    if payload.post_to_finance and payload.movement_type == "payment":
        from app.services.split_payments import lines_total, normalize_payment_lines, post_finance_lines

        note = payload.note or f"Tedarikçi ödemesi — #{supplier_id} {supplier.name}"
        # post_to_finance without method/payments used to post NOTHING (amount=None).
        finance_method = payload.finance_method or (
            "bank" if payload.bank_account_id else "cash"
        )
        fin_lines = normalize_payment_lines(
            payments=payload.payments,
            amount=None if payload.payments else payload.amount,
            finance_method=finance_method,
            cash_register_id=payload.cash_register_id,
            bank_account_id=payload.bank_account_id,
        )
        if fin_lines:
            if payload.payments and abs(lines_total(fin_lines) - payload.amount) > Decimal("0.02"):
                raise HTTPException(
                    status_code=400,
                    detail="Ödeme satırları toplamı hareket tutarı ile eşleşmeli",
                )
            post_finance_lines(
                db,
                fin_lines,
                direction="out",
                mov_date=mov_date,
                note=note,
                supplier_id=supplier_id,
                supplier_movement_id=movement.id,
                created_by_user_id=user.id,
                category="Tedarikçi",
                require_account=True,
            )

    db.commit()
    db.refresh(movement)
    return _movement_out(movement)




@router.delete(
    "/{supplier_id}/movements/{movement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_movement(
    supplier_id: int,
    movement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*LEDGER_WRITE_ROLES)),
) -> None:
    """Delete supplier hareket and reverse linked kasa/banka; purchase sales reverse stock."""
    from app.models.finance import CashMovement, BankMovement
    from app.services.audit import write_audit

    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    movement = db.get(SupplierMovement, movement_id)
    if not movement or movement.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Tedarikçi hareketi bulunamadı")

    note = movement.note or ""
    if "BH_IMPORT:" in note:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BizimHesap aktarım kayıtları silinemez",
        )

    purchase_id = movement.purchase_id
    mtype = movement.movement_type

    # Linked finance
    for m in (
        db.query(CashMovement)
        .filter(CashMovement.supplier_movement_id == movement.id)
        .all()
    ):
        db.delete(m)
    for m in (
        db.query(BankMovement)
        .filter(BankMovement.supplier_movement_id == movement.id)
        .all()
    ):
        db.delete(m)

    # Purchase-linked "purchase" debit: purge sibling movements + reverse stock + delete purchase
    if mtype == "purchase" and purchase_id:
        siblings = (
            db.query(SupplierMovement)
            .filter(
                SupplierMovement.purchase_id == purchase_id,
                SupplierMovement.id != movement.id,
            )
            .all()
        )
        for sib in siblings:
            for m in (
                db.query(CashMovement)
                .filter(CashMovement.supplier_movement_id == sib.id)
                .all()
            ):
                db.delete(m)
            for m in (
                db.query(BankMovement)
                .filter(BankMovement.supplier_movement_id == sib.id)
                .all()
            ):
                db.delete(m)
            db.delete(sib)

        purchase = db.get(Purchase, purchase_id)
        if purchase and purchase.status == "confirmed":
            # Reverse stock increase from confirm
            from app.models.product import Product, ProductVariant, StockMovement

            for line in purchase.lines or []:
                qty = int(line.quantity or 0)
                if qty <= 0 or not line.product_id:
                    continue
                product = db.get(Product, line.product_id)
                if not product:
                    continue
                variant = db.get(ProductVariant, line.variant_id) if line.variant_id else None
                if variant and variant.product_id == product.id:
                    before = int(variant.stock_qty or 0)
                    after = before - qty
                    variant.stock_qty = after
                else:
                    before = int(product.stock_qty or 0)
                    after = before - qty
                    product.stock_qty = after
                db.add(
                    StockMovement(
                        product_id=product.id,
                        variant_id=variant.id if variant else None,
                        direction="decrease",
                        quantity=qty,
                        qty_before=before,
                        qty_after=after,
                        reason="purchase_cancel",
                        note=f"Alış iptal {purchase.purchase_number}",
                        warehouse=getattr(product, "warehouse", None) or "Ana Depo",
                        created_by_user_id=user.id,
                    )
                )
            db.delete(movement)
            db.delete(purchase)
        else:
            db.delete(movement)
            if purchase:
                db.delete(purchase)
    else:
        db.delete(movement)

    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="supplier_movement",
        entity_id=movement_id,
        detail={
            "supplier_id": supplier_id,
            "movement_type": mtype,
            "purchase_id": purchase_id,
        },
    )


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


@router.get("/{supplier_id}/statement-pdf")
def supplier_statement_pdf(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
):
    """Tedarikçi hesap ekstresi PDF — cari döküm şablonu ile."""
    from fastapi.responses import Response
    from app.models.settings_model import AppSetting
    from app.services.pdf import build_cari_statement_pdf

    stmt = supplier_statement(
        supplier_id=supplier_id,
        db=db,
        _=_,
        from_date=from_date,
        to_date=to_date,
    )
    detail = [
        {
            "id": m.id,
            "date": m.movement_date.isoformat() if hasattr(m.movement_date, "isoformat") else m.movement_date,
            "type": m.movement_type,
            "debit": float(m.debit or 0),
            "credit": float(m.credit or 0),
            "balance": float(m.running_balance) if m.running_balance is not None else None,
            "note": sanitize_display_note(m.note),
        }
        for m in stmt.movements
    ]
    settings_map = {s.key: (s.value or "") for s in db.query(AppSetting).all()}
    pdf_bytes = build_cari_statement_pdf(
        stmt.supplier_name,
        detail,
        float(stmt.closing_balance),
        settings_map,
        party_label="Tedarikçi",
        doc_title="Tedarikçi Hesap Ekstresi",
    )
    safe = _ascii_filename(stmt.supplier_name, fallback=f"tedarikci_{supplier_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="tedarikci_ekstre_{supplier_id}_{safe}.pdf"'},
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
    """Borç/alacak fişi PDF — masaüstü antetli letterhead."""
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
        "pdf_alt_baslik": rows.get("pdf_alt_baslik", "Kişiye ve Kuruma Özel Baskı Hizmetleri"),
        "web_adresi": rows.get("web_adresi", "www.baykusbaski.com"),
    }
    pdf_bytes = build_supplier_voucher_pdf(
        supplier.name, tip_out, amount_out, date_out, due_out, note_out, settings
    )
    safe = _ascii_filename(supplier.name, fallback=f"tedarikci_{supplier_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fis-{supplier_id}-{safe}.pdf"'},
    )

