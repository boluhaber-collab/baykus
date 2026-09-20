"""Purchase orders: draft CRUD + confirm (stock + supplier ledger)."""

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


def _apply_stock_increase(db: Session, purchase: Purchase, user_id: int | None) -> None:
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
            after = before + qty_int
            variant.stock_qty = after
            # sync product aggregate
            product.stock_qty = sum(v.stock_qty for v in product.variants)
            db.add(
                StockMovement(
                    product_id=product.id,
                    variant_id=variant.id,
                    direction="increase",
                    quantity=qty_int,
                    qty_before=before,
                    qty_after=after,
                    reason="Satın alma",
                    note=f"{purchase.purchase_number}: {line.description}",
                    warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                    created_by_user_id=user_id,
                )
            )
        elif line.product_id:
            product = db.get(Product, line.product_id)
            if not product or product.product_type == "hizmet":
                continue
            # Prefer product-level stock only when no variants
            if product.variants:
                continue
            before = product.stock_qty or 0
            after = before + qty_int
            product.stock_qty = after
            db.add(
                StockMovement(
                    product_id=product.id,
                    variant_id=None,
                    direction="increase",
                    quantity=qty_int,
                    qty_before=before,
                    qty_after=after,
                    reason="Satın alma",
                    note=f"{purchase.purchase_number}: {line.description}",
                    warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                    created_by_user_id=user_id,
                )
            )


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
    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase.id)
        .one()
    )
    return _purchase_out(purchase)


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
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    purchase = db.get(Purchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    if purchase.status != "draft":
        raise HTTPException(status_code=400, detail="Sadece taslak satın alma düzenlenebilir")

    data = payload.model_dump(exclude_unset=True)
    if "supplier_id" in data and data["supplier_id"] is not None:
        if not db.get(Supplier, data["supplier_id"]):
            raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
        purchase.supplier_id = data["supplier_id"]
    if "purchase_date" in data and data["purchase_date"] is not None:
        purchase.purchase_date = data["purchase_date"]
    if "notes" in data:
        purchase.notes = data["notes"]
    if "tax_amount" in data and data["tax_amount"] is not None:
        purchase.tax_amount = Decimal(str(data["tax_amount"]))
    if "lines" in data and data["lines"] is not None:
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
    db.commit()

    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase_id)
        .one()
    )
    return _purchase_out(purchase)


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

    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase_id)
        .one()
    )
    return _purchase_out(purchase)


@router.post("/{purchase_id}/cancel", response_model=PurchaseOut)
def cancel_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PurchaseOut:
    purchase = db.get(Purchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    if purchase.status == "confirmed":
        raise HTTPException(
            status_code=400,
            detail="Onaylı satın alma iptal edilemez (stok/borç geri alınmaz)",
        )
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Zaten iptal edilmiş")
    purchase.status = "cancelled"
    purchase.updated_at = datetime.utcnow()
    db.commit()
    purchase = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.lines).joinedload(PurchaseLine.product),
            joinedload(Purchase.lines).joinedload(PurchaseLine.variant),
        )
        .filter(Purchase.id == purchase_id)
        .one()
    )
    return _purchase_out(purchase)


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    purchase = db.get(Purchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Satın alma bulunamadı")
    if purchase.status == "confirmed":
        raise HTTPException(status_code=400, detail="Onaylı satın alma silinemez")
    db.delete(purchase)
    db.commit()
