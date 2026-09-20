"""Depolar CRUD + stock-by-warehouse + transfer stub."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.product import DEFAULT_WAREHOUSE, Product, ProductVariant, StockMovement
from app.models.user import User
from app.models.warehouse import Warehouse
from app.schemas.warehouse import WarehouseCreate, WarehouseOut, WarehouseTransfer, WarehouseUpdate

router = APIRouter(prefix="/stock/warehouses", tags=["warehouses"])

READ = ("admin", "satış", "üretim", "muhasebe")
WRITE = ("admin", "üretim")


def _stats(db: Session, name: str) -> tuple[int, int]:
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


@router.post("/transfer")
def transfer_stock(
    payload: WarehouseTransfer,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> dict:
    """Stub transfer: move product.warehouse label + record paired stock movements."""
    if payload.from_warehouse.strip() == payload.to_warehouse.strip():
        raise HTTPException(status_code=400, detail="Kaynak ve hedef depo aynı olamaz")
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    current = (product.warehouse or DEFAULT_WAREHOUSE).strip()
    if current != payload.from_warehouse.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Ürün şu an '{current}' deposunda (beklenen: {payload.from_warehouse})",
        )
    to_wh = payload.to_warehouse.strip()
    if not db.query(Warehouse).filter(Warehouse.name == to_wh).first():
        # Allow free-text target but prefer known warehouses
        pass

    variant = None
    if payload.variant_id:
        variant = db.get(ProductVariant, payload.variant_id)
        if not variant or variant.product_id != product.id:
            raise HTTPException(status_code=400, detail="Varyant bulunamadı")
        qty_before = int(variant.stock_qty or 0)
    else:
        qty_before = int(product.stock_qty or 0)

    if payload.quantity > qty_before:
        raise HTTPException(status_code=400, detail="Yetersiz stok")

    note = payload.note or f"Transfer: {payload.from_warehouse} → {to_wh}"
    # decrease from source (logical), then set warehouse, increase at dest — qty unchanged overall
    db.add(
        StockMovement(
            product_id=product.id,
            variant_id=variant.id if variant else None,
            direction="decrease",
            quantity=payload.quantity,
            qty_before=qty_before,
            qty_after=qty_before,
            reason="transfer_out",
            note=note,
            warehouse=payload.from_warehouse,
            created_by_user_id=user.id,
        )
    )
    product.warehouse = to_wh
    db.add(
        StockMovement(
            product_id=product.id,
            variant_id=variant.id if variant else None,
            direction="increase",
            quantity=payload.quantity,
            qty_before=qty_before,
            qty_after=qty_before,
            reason="transfer_in",
            note=note,
            warehouse=to_wh,
            created_by_user_id=user.id,
        )
    )
    db.commit()
    return {
        "ok": True,
        "product_id": product.id,
        "from_warehouse": payload.from_warehouse,
        "to_warehouse": to_wh,
        "quantity": payload.quantity,
        "note": note,
    }

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
        # Rename product warehouse labels
        old = row.name
        db.query(Product).filter(Product.warehouse == old).update(
            {Product.warehouse: data["name"]}, synchronize_session=False
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
    pc, _ = _stats(db, row.name)
    if pc > 0:
        raise HTTPException(status_code=400, detail="Depoda ürün varken silinemez — önce taşıyın")
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
    products = (
        db.query(Product)
        .filter(Product.warehouse == row.name)
        .order_by(Product.name)
        .all()
    )
    out = []
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
