"""Maliyet Yönetimi — cost items CRUD."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.cost_item import CostItem
from app.models.user import User
from app.schemas.cost_item import CostItemCreate, CostItemOut, CostItemUpdate

router = APIRouter(prefix="/tools/costs", tags=["costs"])

READ = ("admin", "satış", "muhasebe", "üretim")
WRITE = ("admin", "muhasebe")


def _out(row: CostItem) -> CostItemOut:
    return CostItemOut(
        id=row.id,
        category=row.category,
        name=row.name,
        unit=row.unit,
        unit_cost=Decimal(str(row.unit_cost or 0)),
        note=row.note,
        active=bool(row.active),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[CostItemOut])
def list_costs(
    active: bool | None = Query(default=None),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[CostItemOut]:
    q = db.query(CostItem).order_by(CostItem.category, CostItem.name)
    if active is not None:
        q = q.filter(CostItem.active.is_(active))
    if category:
        q = q.filter(CostItem.category == category)
    return [_out(r) for r in q.all()]


@router.post("", response_model=CostItemOut, status_code=status.HTTP_201_CREATED)
def create_cost(
    payload: CostItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> CostItemOut:
    row = CostItem(
        category=payload.category.strip(),
        name=payload.name.strip(),
        unit=payload.unit or "adet",
        unit_cost=payload.unit_cost,
        note=payload.note,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.put("/{item_id}", response_model=CostItemOut)
def update_cost(
    item_id: int,
    payload: CostItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> CostItemOut:
    row = db.get(CostItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    for key in ("category", "name"):
        if key in data and data[key]:
            data[key] = data[key].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cost(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(CostItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı")
    db.delete(row)
    db.commit()
