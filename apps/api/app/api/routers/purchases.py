"""Purchase orders: draft/confirmed CRUD + confirm/cancel (stock + supplier ledger)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.product import DEFAULT_WAREHOUSE, Product, ProductVariant, StockMovement
from app.models.supplier import Purchase, PurchaseLine, Supplier, SupplierMovement
from app.models.user import User
from app.schemas.purchase import (
    PurchaseCreate,
    PurchaseLineIn,
    PurchaseLineOut,
    PurchaseListItem,
    PurchaseOut,
    PurchaseUpdate,
)

router = APIRouter(prefix="/purchases", tags=["purchases"])

READ_ROLES = ("admin", "üretim", "muhasebe", "satış")
WRITE_ROLES = ("admin", "üretim", "muhasebe")

BH_IMPORT_MARKER = "BH_IMPORT:"


def _is_bh_import_note(note: str | None) -> bool:
    if not note:
        return False
    return BH_IMPORT_MARKER in note


def _refuse_bh_purchase(db: Session, purchase: Purchase) -> None:
    """BizimHesap aktarım alışları düzenlenemez / iptal edilemez."""
    if _is_bh_import_note(purchase.notes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BizimHesap aktarım kayıtları düzenlenemez / iptal edilemez",
        )
    movs = (
        db.query(SupplierMovement)
        .filter(SupplierMovement.purchase_id == purchase.id)
        .all()
    )
    for mov in movs:
        if _is_bh_import_note(mov.note):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="BizimHesap aktarım kayıtları düzenlenemez / iptal edilemez",
            )


def _next_purchase_number(db: Session) -> str:
    year = date.today().year
    prefix = f"SA-{year}-"
    last = (
        db.query(Purchase.purchase_number)
        .filter(Purchase.purchase_number.like(f"{prefix}%"))
        .order_by(Purchase.purchase_number.desc())
        .first()
    )
    seq = 1
    if last and last[0]:
        try:
            seq = int(last[0].rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    return f"{prefix}{seq:04d}"


def _line_out(line: PurchaseLine) -> PurchaseLineOut:
    product_name = line.product.name if line.product is not None else None
    variant_name = line.variant.name if line.variant is not None else None
    return PurchaseLineOut(
        id=line.id,
        product_id=line.product_id,
        variant_id=line.variant_id,
        description=line.description,
        quantity=line.quantity,
        unit_cost=line.unit_cost,
        line_total=line.line_total,
        product_name=product_name,
        variant_name=variant_name,
    )


def _purchase_list_item(p: Purchase) -> PurchaseListItem:
    return PurchaseListItem(
        id=p.id,
        purchase_number=p.purchase_number,
        supplier_id=p.supplier_id,
        supplier_name=p.supplier.name if p.supplier else "",
        purchase_date=p.purchase_date,
        status=p.status,
        subtotal=p.subtotal or Decimal("0"),
        tax_amount=p.tax_amount or Decimal("0"),
        total_amount=p.total_amount or Decimal("0"),
        notes=p.notes,
        created_at=p.created_at,
    )


def _purchase_out(p: Purchase) -> PurchaseOut:
    base = _purchase_list_item(p)
    return PurchaseOut(
        **base.model_dump(),
        lines=[_line_out(l) for l in p.lines],
        confirmed_at=p.confirmed_at,
        updated_at=p.updated_at,
    )


def _reload_purchase(db: Session, purchase_id: int) -> Purchase:
    return (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase_id)
        .one()
    )


def _build_lines(db: Session, lines_in: list[PurchaseLineIn]) -> tuple[list[PurchaseLine], Decimal]:
    built: list[PurchaseLine] = []
    subtotal = Decimal("0")
    for row in lines_in:
        if row.product_id is not None:
            product = db.get(Product, row.product_id)
            if not product:
                raise HTTPException(status_code=400, detail=f"Ürün bulunamadı: {row.product_id}")
        if row.variant_id is not None:
            variant = db.get(ProductVariant, row.variant_id)
            if not variant:
                raise HTTPException(status_code=400, detail=f"Varyant bulunamadı: {row.variant_id}")
            if row.product_id is not None and variant.product_id != row.product_id:
                raise HTTPException(status_code=400, detail="Varyant ürünle eşleşmiyor")
        qty = Decimal(str(row.quantity))
        cost = Decimal(str(row.unit_cost))
        line_total = (qty * cost).quantize(Decimal("0.01"))
        subtotal += line_total
        built.append(
            PurchaseLine(
                product_id=row.product_id,
                variant_id=row.variant_id,
                description=row.description.strip(),
                quantity=qty,
                unit_cost=cost,
                line_total=line_total,
            )
        )
    return built, subtotal


def _apply_stock_delta(
    db: Session,
    purchase: Purchase,
    user_id: int | None,
    *,
    increase: bool,
    reason: str,
    note_prefix: str,
) -> None:
    """Increase (confirm) or decrease (cancel/edit) stock for purchase lines."""
    direction = "increase" if increase else "decrease"
    for line in purchase.lines:
        qty_int = int(line.quantity)
        if qty_int <= 0:
            continue
        if line.variant_id:
            variant = db.get(ProductVariant, line.variant_id)
            if not variant:
                continue
            product = db.get(Product, variant.product_id)
            if not product or product.product_type == "hizmet":
                continue
            before = variant.stock_qty or 0
            after = before + qty_int if increase else before - qty_int
            variant.stock_qty = after
            product.stock_qty = sum(v.stock_qty for v in product.variants)
            stock_at = datetime.combine(purchase.purchase_date, datetime.utcnow().time())
            db.add(
                StockMovement(
                    product_id=product.id,
                    variant_id=variant.id,
                    direction=direction,
                    quantity=qty_int,
                    qty_before=before,
                    qty_after=after,
                    reason=reason,
                    note=f"{note_prefix}{purchase.purchase_number}: {line.description}",
                    warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                    created_by_user_id=user_id,
                    created_at=stock_at,
                )
            )
        elif line.product_id:
            product = db.get(Product, line.product_id)
            if not product or product.product_type == "hizmet":
                continue
            if product.variants:
                continue
            before = product.stock_qty or 0
            after = before + qty_int if increase else before - qty_int
            product.stock_qty = after
            stock_at = datetime.combine(purchase.purchase_date, datetime.utcnow().time())
            db.add(
                StockMovement(
                    product_id=product.id,
                    variant_id=None,
                    direction=direction,
                    quantity=qty_int,
                    qty_before=before,
                    qty_after=after,
                    reason=reason,
                    note=f"{note_prefix}{purchase.purchase_number}: {line.description}",
                    warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                    created_by_user_id=user_id,
                    created_at=stock_at,
                )
            )


def _apply_stock_increase(db: Session, purchase: Purchase, user_id: int | None) -> None:
    _apply_stock_delta(
        db,
        purchase,
        user_id,
        increase=True,
        reason="Satın alma",
        note_prefix="",
    )


def _apply_stock_decrease(
    db: Session,
    purchase: Purchase,
    user_id: int | None,
    *,
    reason: str = "purchase_cancel",
    note_label: str = "Alış iptal ",
) -> None:
    _apply_stock_delta(
        db,
        purchase,
        user_id,
        increase=False,
        reason=reason,
        note_prefix=note_label,
    )


def _purge_purchase_ledger(db: Session, purchase: Purchase) -> None:
    """Remove supplier movements for this purchase and linked kasa/banka legs."""
    from app.models.finance import BankMovement, CashMovement

    movs = (
        db.query(SupplierMovement)
        .filter(SupplierMovement.purchase_id == purchase.id)
        .all()
    )
    for mov in movs:
        for m in (
            db.query(CashMovement)
            .filter(CashMovement.supplier_movement_id == mov.id)
            .all()
        ):
            db.delete(m)
        for m in (
            db.query(BankMovement)
            .filter(BankMovement.supplier_movement_id == mov.id)
            .all()
        ):
            db.delete(m)
        db.delete(mov)


def _sync_purchase_supplier_debit(db: Session, purchase: Purchase) -> None:
    """Ensure a single purchase-type debit matches total_amount (payments untouched)."""
    purchase_movs = (
        db.query(SupplierMovement)
        .filter(
            SupplierMovement.purchase_id == purchase.id,
            SupplierMovement.movement_type == "purchase",
        )
        .all()
    )
    total = purchase.total_amount or Decimal("0")
    if not purchase_movs:
        if total > 0:
            db.add(
                SupplierMovement(
                    supplier_id=purchase.supplier_id,
                    movement_type="purchase",
                    debit=total,
                    credit=Decimal("0"),
                    movement_date=purchase.purchase_date,
                    purchase_id=purchase.id,
                    note=f"Satın alma {purchase.purchase_number}",
                )
            )
        return
    # Keep first; drop duplicate purchase debits (should be rare)
    primary = purchase_movs[0]
    for extra in purchase_movs[1:]:
        db.delete(extra)
    if total > 0:
        primary.debit = total
        primary.credit = Decimal("0")
        primary.movement_date = purchase.purchase_date
        primary.supplier_id = purchase.supplier_id
        primary.note = f"Satın alma {purchase.purchase_number}"
    else:
        db.delete(primary)


def _confirm_purchase(db: Session, purchase: Purchase, user_id: int | None) -> None:
    if purchase.status == "confirmed":
        raise HTTPException(status_code=400, detail="Satın alma zaten onaylı")
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="İptal edilmiş satın alma onaylanamaz")
    if not purchase.lines:
        raise HTTPException(status_code=400, detail="Satır olmadan onaylanamaz")

    _apply_stock_increase(db, purchase, user_id)

    total = purchase.total_amount or Decimal("0")
    if total > 0:
        db.add(
            SupplierMovement(
                supplier_id=purchase.supplier_id,
                movement_type="purchase",
                debit=total,
                credit=Decimal("0"),
                movement_date=purchase.purchase_date,
                purchase_id=purchase.id,
                note=f"Satın alma {purchase.purchase_number}",
            )
        )

    purchase.status = "confirmed"
    purchase.confirmed_at = datetime.utcnow()
    purchase.updated_at = datetime.utcnow()


@router.get("", response_model=list[PurchaseListItem])
def list_purchases(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    q: str | None = Query(default=None),
    supplier_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    exclude_cancelled: bool = Query(default=False),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    skip: int = 0,
    limit: int = 200,
) -> list[PurchaseListItem]:
    query = db.query(Purchase).options(joinedload(Purchase.supplier))
    if supplier_id is not None:
        query = query.filter(Purchase.supplier_id == supplier_id)
    if status_filter:
        query = query.filter(Purchase.status == status_filter)
    elif exclude_cancelled:
        query = query.filter(Purchase.status != "cancelled")
    if from_date:
        query = query.filter(Purchase.purchase_date >= from_date)
    if to_date:
        query = query.filter(Purchase.purchase_date <= to_date)
    if q:
        like = f"%{q}%"
        query = query.outerjoin(Supplier).filter(
            or_(
                Purchase.purchase_number.ilike(like),
                Purchase.notes.ilike(like),
                Supplier.name.ilike(like),
            )
        )
    rows = (
        query.order_by(Purchase.purchase_date.desc(), Purchase.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_purchase_list_item(p) for p in rows]


@router.post("", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")

    number = payload.purchase_number.strip() if payload.purchase_number else None
    if number:
        if db.query(Purchase).filter(Purchase.purchase_number == number).first():
            raise HTTPException(status_code=400, detail="Satın alma numarası zaten kullanılıyor")
    else:
        number = _next_purchase_number(db)

    lines, subtotal = _build_lines(db, payload.lines)
    tax = Decimal(str(payload.tax_amount or 0))
    total = subtotal + tax

    purchase = Purchase(
        purchase_number=number,
        supplier_id=payload.supplier_id,
        purchase_date=payload.purchase_date or date.today(),
        status="draft",
        notes=payload.notes,
        subtotal=subtotal,
        tax_amount=tax,
        total_amount=total,
        created_by_user_id=user.id,
    )
    purchase.lines = lines
    db.add(purchase)
    db.flush()

    if payload.confirm:
        _confirm_purchase(db, purchase, user.id)

    db.commit()
    return _purchase_out(_reload_purchase(db, purchase.id))


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> PurchaseOut:
    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    return _purchase_out(purchase)


@router.put("/{purchase_id}", response_model=PurchaseOut)
def update_purchase(
    purchase_id: int,
    payload: PurchaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    purchase = (
        db.query(Purchase)
        .options(joinedload(Purchase.lines))
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="İptal edilmiş satın alma düzenlenemez")

    _refuse_bh_purchase(db, purchase)

    data = payload.model_dump(exclude_unset=True)
    was_confirmed = purchase.status == "confirmed"
    lines_changing = "lines" in data and data["lines"] is not None

    # Confirmed: supplier change is unsafe (payments / cari history)
    if was_confirmed and "supplier_id" in data and data["supplier_id"] is not None:
        if data["supplier_id"] != purchase.supplier_id:
            raise HTTPException(
                status_code=400,
                detail="Onaylı alışta tedarikçi değiştirilemez (güvenli düzenleme)",
            )

    if was_confirmed and lines_changing:
        # Reverse stock from old lines, then rebuild + re-apply
        _apply_stock_decrease(
            db,
            purchase,
            user.id,
            reason="purchase_edit",
            note_label="Alış düzenleme (eski) ",
        )

    if "supplier_id" in data and data["supplier_id"] is not None and not was_confirmed:
        if not db.get(Supplier, data["supplier_id"]):
            raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
        purchase.supplier_id = data["supplier_id"]
    if "purchase_date" in data and data["purchase_date"] is not None:
        purchase.purchase_date = data["purchase_date"]
    if "notes" in data:
        purchase.notes = data["notes"]
    if "tax_amount" in data and data["tax_amount"] is not None:
        purchase.tax_amount = Decimal(str(data["tax_amount"]))

    if lines_changing:
        lines_in = [PurchaseLineIn(**row) if isinstance(row, dict) else row for row in payload.lines or []]
        if not lines_in:
            raise HTTPException(status_code=400, detail="En az bir satır gerekli")
        purchase.lines.clear()
        db.flush()
        built, subtotal = _build_lines(db, lines_in)
        purchase.lines = built
        purchase.subtotal = subtotal
    else:
        subtotal = purchase.subtotal or Decimal("0")

    purchase.total_amount = (purchase.subtotal or Decimal("0")) + (purchase.tax_amount or Decimal("0"))
    purchase.updated_at = datetime.utcnow()

    if was_confirmed:
        if lines_changing:
            _apply_stock_increase(db, purchase, user.id)
            # Tag stock note reason via last movements already "Satın alma"; OK
        _sync_purchase_supplier_debit(db, purchase)

    db.commit()
    return _purchase_out(_reload_purchase(db, purchase_id))


@router.post("/{purchase_id}/confirm", response_model=PurchaseOut)
def confirm_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    purchase = (
        db.query(Purchase)
        .options(joinedload(Purchase.lines))
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    _confirm_purchase(db, purchase, user.id)
    db.commit()
    return _purchase_out(_reload_purchase(db, purchase_id))


@router.post("/{purchase_id}/cancel", response_model=PurchaseOut)
def cancel_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    """Cancel draft or confirmed purchase.

    Confirmed: reverse stock ↑, purge supplier cari + linked kasa/banka, mark cancelled.
    Draft: status only. BH_IMPORT refused.
    """
    purchase = (
        db.query(Purchase)
        .options(joinedload(Purchase.lines))
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Zaten iptal edilmiş")

    _refuse_bh_purchase(db, purchase)

    if purchase.status == "confirmed":
        _apply_stock_decrease(
            db,
            purchase,
            user.id,
            reason="purchase_cancel",
            note_label="Alış iptal ",
        )
        _purge_purchase_ledger(db, purchase)

    purchase.status = "cancelled"
    purchase.updated_at = datetime.utcnow()
    db.commit()

    from app.services.audit import write_audit

    write_audit(
        user_id=user.id,
        action="update",
        entity_type="purchase",
        entity_id=purchase_id,
        detail={
            "purchase_number": purchase.purchase_number,
            "status": "cancelled",
            "ledger_purged": True,
        },
    )
    return _purchase_out(_reload_purchase(db, purchase_id))


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "muhasebe")),
) -> None:
    """Delete purchase; if confirmed, reverse stock and purge supplier + finance legs."""
    from app.services.audit import write_audit

    purchase = (
        db.query(Purchase)
        .options(joinedload(Purchase.lines))
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")

    _refuse_bh_purchase(db, purchase)

    _purge_purchase_ledger(db, purchase)

    if purchase.status == "confirmed":
        _apply_stock_decrease(
            db,
            purchase,
            user.id,
            reason="purchase_cancel",
            note_label="Alış silindi ",
        )

    number = purchase.purchase_number
    db.delete(purchase)
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="purchase",
        entity_id=purchase_id,
        detail={"purchase_number": number},
    )
