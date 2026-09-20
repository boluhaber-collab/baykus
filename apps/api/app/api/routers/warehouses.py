"""Depolar CRUD + per-warehouse stock + Depolar Arası Transfer."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.product import DEFAULT_WAREHOUSE, Product, ProductVariant, StockMovement
from app.models.user import User
from app.models.warehouse import Warehouse, WarehouseStock
from app.schemas.warehouse import (
    WarehouseCreate,
    WarehouseOut,
    WarehouseTransfer,
    WarehouseTransferResult,
    WarehouseUpdate,
)

router = APIRouter(prefix="/stock/warehouses", tags=["warehouses"])

READ = ("admin", "satış", "üretim", "muhasebe")
WRITE = ("admin", "üretim")


def _vkey(variant_id: int | None) -> int:
    return int(variant_id or 0)


def _get_balance(
    db: Session, product_id: int, variant_id: int | None, warehouse: str
) -> WarehouseStock | None:
    return (
        db.query(WarehouseStock)
        .filter(
            WarehouseStock.product_id == product_id,
            WarehouseStock.variant_key == _vkey(variant_id),
            WarehouseStock.warehouse == warehouse,
        )
        .first()
    )


def _ensure_balance(
    db: Session,
    product: Product,
    variant: ProductVariant | None,
    warehouse: str,
    *,
    bootstrap_qty: int | None = None,
) -> WarehouseStock:
    """Get or create balance row; optionally seed qty from product/variant once."""
    wh = (warehouse or DEFAULT_WAREHOUSE).strip() or DEFAULT_WAREHOUSE
    vid = variant.id if variant else None
    row = _get_balance(db, product.id, vid, wh)
    if row:
        return row
    qty = 0
    if bootstrap_qty is not None:
        qty = max(0, int(bootstrap_qty))
    row = WarehouseStock(
        product_id=product.id,
        variant_id=vid,
        variant_key=_vkey(vid),
        warehouse=wh,
        quantity=qty,
    )
    db.add(row)
    db.flush()
    return row


def _sync_aggregate(db: Session, product: Product, variant: ProductVariant | None) -> None:
    """Recompute product/variant stock_qty as sum of warehouse balances."""
    if variant is not None:
        total = (
            db.query(WarehouseStock)
            .filter(
                WarehouseStock.product_id == product.id,
                WarehouseStock.variant_key == variant.id,
            )
            .all()
        )
        variant.stock_qty = sum(int(r.quantity or 0) for r in total)
        # Also keep product aggregate as sum of all variant balances + bare
        all_rows = (
            db.query(WarehouseStock).filter(WarehouseStock.product_id == product.id).all()
        )
        product.stock_qty = sum(int(r.quantity or 0) for r in all_rows)
    else:
        rows = (
            db.query(WarehouseStock)
            .filter(
                WarehouseStock.product_id == product.id,
                WarehouseStock.variant_key == 0,
            )
            .all()
        )
        product.stock_qty = sum(int(r.quantity or 0) for r in rows)


def _bootstrap_from_legacy(db: Session, product: Product) -> None:
    """If no warehouse_stocks yet for product, seed from product.warehouse + qtys."""
    existing = (
        db.query(WarehouseStock)
        .filter(WarehouseStock.product_id == product.id)
        .count()
    )
    if existing:
        return
    wh = (product.warehouse or DEFAULT_WAREHOUSE).strip() or DEFAULT_WAREHOUSE
    if product.variants:
        for v in product.variants:
            q = int(v.stock_qty or 0)
            if q > 0 or True:
                _ensure_balance(db, product, v, wh, bootstrap_qty=q)
    else:
        _ensure_balance(db, product, None, wh, bootstrap_qty=int(product.stock_qty or 0))
    db.flush()


def _stats(db: Session, name: str) -> tuple[int, int]:
    rows = (
        db.query(WarehouseStock)
        .filter(WarehouseStock.warehouse == name, WarehouseStock.quantity > 0)
        .all()
    )
    if rows:
        product_ids = {r.product_id for r in rows}
        return len(product_ids), sum(int(r.quantity or 0) for r in rows)
    # Legacy fallback: Product.warehouse label
    products = db.query(Product).filter(Product.warehouse == name).all()
    count = len(products)
    qty = 0
    for p in products:
        if p.variants:
            qty += sum(int(v.stock_qty or 0) for v in p.variants)
        else:
            qty += int(p.stock_qty or 0)
    return count, qty


def _out(db: Session, w: Warehouse) -> WarehouseOut:
    pc, sq = _stats(db, w.name)
    return WarehouseOut(
        id=w.id,
        name=w.name,
        code=w.code,
        address=w.address,
        notes=w.notes,
        is_active=bool(w.is_active),
        is_default=bool(w.is_default),
        product_count=pc,
        stock_qty_total=sq,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


def _clear_default(db: Session, except_id: int | None = None) -> None:
    q = db.query(Warehouse).filter(Warehouse.is_default.is_(True))
    if except_id is not None:
        q = q.filter(Warehouse.id != except_id)
    for row in q.all():
        row.is_default = False


@router.get("", response_model=list[WarehouseOut])
def list_warehouses(
    active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[WarehouseOut]:
    q = db.query(Warehouse).order_by(Warehouse.is_default.desc(), Warehouse.name)
    if active is not None:
        q = q.filter(Warehouse.is_active.is_(active))
    return [_out(db, w) for w in q.all()]


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> WarehouseOut:
    name = payload.name.strip()
    if db.query(Warehouse).filter(Warehouse.name == name).first():
        raise HTTPException(status_code=400, detail="Depo adı zaten var")
    if payload.code and db.query(Warehouse).filter(Warehouse.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Depo kodu zaten var")
    if payload.is_default:
        _clear_default(db)
    row = Warehouse(
        name=name,
        code=(payload.code or None),
        address=payload.address,
        notes=payload.notes,
        is_active=payload.is_active,
        is_default=payload.is_default,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(db, row)


@router.post("/transfer", response_model=WarehouseTransferResult)
def transfer_stock(
    payload: WarehouseTransfer,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> WarehouseTransferResult:
    """Depolar Arası Transfer — decrease source balance, increase/create target."""
    from_wh = payload.from_warehouse.strip()
    to_wh = payload.to_warehouse.strip()
    if from_wh.casefold() == to_wh.casefold():
        raise HTTPException(status_code=400, detail="Kaynak ve hedef depo aynı olamaz")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Transfer miktarı sıfırdan büyük olmalıdır")

    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")

    variant: ProductVariant | None = None
    if payload.variant_id:
        variant = db.get(ProductVariant, payload.variant_id)
        if not variant or variant.product_id != product.id:
            raise HTTPException(status_code=400, detail="Varyant bulunamadı")

    # Prefer known warehouses but allow free-text target (desktop behavior)
    if not db.query(Warehouse).filter(Warehouse.name == to_wh).first():
        # create soft warehouse entry so UI lists it
        db.add(Warehouse(name=to_wh, is_active=True, notes="Transfer ile oluştu"))
        db.flush()

    _bootstrap_from_legacy(db, product)

    # Source qty: balance row or legacy product.warehouse match
    src = _get_balance(db, product.id, variant.id if variant else None, from_wh)
    if not src:
        legacy_wh = (product.warehouse or DEFAULT_WAREHOUSE).strip()
        if legacy_wh.casefold() == from_wh.casefold():
            boot_qty = int(variant.stock_qty if variant else product.stock_qty or 0)
            src = _ensure_balance(
                db, product, variant, from_wh, bootstrap_qty=boot_qty
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Kaynak depoda transfer edilecek stok yok ({from_wh})",
            )

    src_before = int(src.quantity or 0)
    if payload.quantity > src_before:
        raise HTTPException(
            status_code=400,
            detail=f"Kaynak depoda en fazla {src_before} adet transfer edilebilir",
        )

    src.quantity = src_before - payload.quantity
    tgt = _ensure_balance(db, product, variant, to_wh, bootstrap_qty=0)
    tgt_before = int(tgt.quantity or 0)
    tgt.quantity = tgt_before + payload.quantity

    _sync_aggregate(db, product, variant)

    # Primary warehouse label: keep source if still has stock, else target
    if src.quantity > 0:
        product.warehouse = from_wh
    else:
        product.warehouse = to_wh

    note = payload.note or f"Transfer: {from_wh} → {to_wh}"
    label = f"{product.name}" + (f" / {variant.name}" if variant else "")
    db.add(
        StockMovement(
            product_id=product.id,
            variant_id=variant.id if variant else None,
            direction="decrease",
            quantity=payload.quantity,
            qty_before=src_before,
            qty_after=src.quantity,
            reason="transfer_out",
            note=f"{note} | {label}",
            warehouse=from_wh,
            created_by_user_id=user.id,
        )
    )
    db.add(
        StockMovement(
            product_id=product.id,
            variant_id=variant.id if variant else None,
            direction="increase",
            quantity=payload.quantity,
            qty_before=tgt_before,
            qty_after=tgt.quantity,
            reason="transfer_in",
            note=f"{note} | {label}",
            warehouse=to_wh,
            created_by_user_id=user.id,
        )
    )
    db.commit()
    return WarehouseTransferResult(
        ok=True,
        product_id=product.id,
        variant_id=variant.id if variant else None,
        from_warehouse=from_wh,
        to_warehouse=to_wh,
        quantity=payload.quantity,
        source_qty_after=int(src.quantity),
        target_qty_after=int(tgt.quantity),
        note=note,
    )


@router.get("/{warehouse_id}", response_model=WarehouseOut)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> WarehouseOut:
    row = db.get(Warehouse, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Depo bulunamadı")
    return _out(db, row)


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> WarehouseOut:
    row = db.get(Warehouse, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Depo bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()
        clash = (
            db.query(Warehouse)
            .filter(Warehouse.name == data["name"], Warehouse.id != warehouse_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Depo adı zaten var")
        old = row.name
        db.query(Product).filter(Product.warehouse == old).update(
            {Product.warehouse: data["name"]}, synchronize_session=False
        )
        db.query(WarehouseStock).filter(WarehouseStock.warehouse == old).update(
            {WarehouseStock.warehouse: data["name"]}, synchronize_session=False
        )
    if data.get("is_default"):
        _clear_default(db, except_id=warehouse_id)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _out(db, row)


@router.delete("/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(Warehouse, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Depo bulunamadı")
    if row.name.casefold() in {"ana depo", "bolu bayi"}:
        raise HTTPException(
            status_code=400,
            detail="Ana Depo ve BOLU BAYİ varsayılan depolardır; silinemez",
        )
    pc, _ = _stats(db, row.name)
    if pc > 0:
        raise HTTPException(
            status_code=400,
            detail="Depoda ürün varken silinemez — önce stokları başka depoya aktarın",
        )
    db.delete(row)
    db.commit()


@router.get("/{warehouse_id}/stock")
def warehouse_stock(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[dict]:
    row = db.get(Warehouse, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Depo bulunamadı")

    # Prefer warehouse_stocks
    balances = (
        db.query(WarehouseStock)
        .filter(WarehouseStock.warehouse == row.name, WarehouseStock.quantity > 0)
        .all()
    )
    out: list[dict] = []
    if balances:
        for b in balances:
            product = db.get(Product, b.product_id)
            if not product:
                continue
            if b.variant_id:
                v = db.get(ProductVariant, b.variant_id)
                if not v:
                    continue
                out.append(
                    {
                        "product_id": product.id,
                        "variant_id": v.id,
                        "sku": v.sku,
                        "name": f"{product.name} / {v.name}",
                        "stock_qty": int(b.quantity or 0),
                        "warehouse": row.name,
                    }
                )
            else:
                out.append(
                    {
                        "product_id": product.id,
                        "variant_id": None,
                        "sku": product.sku,
                        "name": product.name,
                        "stock_qty": int(b.quantity or 0),
                        "warehouse": row.name,
                    }
                )
        out.sort(key=lambda x: x["name"])
        return out

    # Legacy: products tagged with this warehouse
    products = (
        db.query(Product)
        .filter(Product.warehouse == row.name)
        .order_by(Product.name)
        .all()
    )
    for p in products:
        if p.variants:
            for v in p.variants:
                out.append(
                    {
                        "product_id": p.id,
                        "variant_id": v.id,
                        "sku": v.sku,
                        "name": f"{p.name} / {v.name}",
                        "stock_qty": int(v.stock_qty or 0),
                        "warehouse": row.name,
                    }
                )
        else:
            out.append(
                {
                    "product_id": p.id,
                    "variant_id": None,
                    "sku": p.sku,
                    "name": p.name,
                    "stock_qty": int(p.stock_qty or 0),
                    "warehouse": row.name,
                }
            )
    return out
