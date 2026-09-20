"""Sabit kıymetler CRUD."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.asset import DEPRECIATION_METHODS, Asset
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetOut, AssetUpdate

router = APIRouter(prefix="/finance/assets", tags=["assets"])

READ = ("admin", "muhasebe")
WRITE = ("admin", "muhasebe")


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def _book_stats(asset: Asset) -> tuple[Decimal | None, Decimal | None]:
    """Simple straight-line book value + monthly depreciation."""
    cost = _d(asset.cost)
    method = (asset.depreciation_method or "none").strip()
    months = asset.useful_life_months
    if method != "straight_line" or not months or months <= 0 or not asset.purchase_date:
        return None, None
    monthly = (cost / Decimal(months)).quantize(Decimal("0.01"))
    today = date.today()
    elapsed = (today.year - asset.purchase_date.year) * 12 + (
        today.month - asset.purchase_date.month
    )
    if today.day < asset.purchase_date.day:
        elapsed -= 1
    elapsed = max(0, min(elapsed, months))
    book = max(cost - monthly * Decimal(elapsed), Decimal("0"))
    return book.quantize(Decimal("0.01")), monthly


def _out(a: Asset) -> AssetOut:
    book, monthly = _book_stats(a)
    return AssetOut(
        id=a.id,
        name=a.name,
        category=a.category,
        purchase_date=a.purchase_date,
        cost=_d(a.cost),
        depreciation_method=a.depreciation_method or "none",
        useful_life_months=a.useful_life_months,
        note=a.note,
        active=bool(a.active),
        book_value=book,
        monthly_depreciation=monthly,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


@router.get("", response_model=list[AssetOut])
def list_assets(
    active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[AssetOut]:
    q = db.query(Asset).order_by(Asset.name)
    if active is not None:
        q = q.filter(Asset.active.is_(active))
    return [_out(a) for a in q.all()]


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> AssetOut:
    method = payload.depreciation_method or "none"
    if method not in DEPRECIATION_METHODS:
        raise HTTPException(status_code=400, detail="Geçersiz amortisman yöntemi")
    row = Asset(
        name=payload.name.strip(),
        category=payload.category,
        purchase_date=payload.purchase_date,
        cost=payload.cost,
        depreciation_method=method,
        useful_life_months=payload.useful_life_months,
        note=payload.note,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> AssetOut:
    row = db.get(Asset, asset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kıymet bulunamadı")
    return _out(row)


@router.put("/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> AssetOut:
    row = db.get(Asset, asset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kıymet bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "depreciation_method" in data and data["depreciation_method"] is not None:
        if data["depreciation_method"] not in DEPRECIATION_METHODS:
            raise HTTPException(status_code=400, detail="Geçersiz amortisman yöntemi")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(Asset, asset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kıymet bulunamadı")
    db.delete(row)
    db.commit()
