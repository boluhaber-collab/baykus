"""Fiyat listeleri CRUD."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.price_list import PriceList, PriceListItem
from app.models.user import User
from app.schemas.price_list import (
    PriceListCreate,
    PriceListListItem,
    PriceListOut,
    PriceListUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/price-lists", tags=["price-lists"])


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def _to_list(pl: PriceList) -> PriceListListItem:
    return PriceListListItem(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        currency=pl.currency or "TRY",
        is_active=bool(pl.is_active),
        valid_from=pl.valid_from,
        valid_to=pl.valid_to,
        item_count=len(pl.items or []),
        created_at=pl.created_at,
        updated_at=pl.updated_at,
    )


def _to_out(pl: PriceList) -> PriceListOut:
    return PriceListOut(**_to_list(pl).model_dump(), items=pl.items or [])


def _load(db: Session, list_id: int) -> PriceList:
    pl = (
        db.query(PriceList)
        .options(joinedload(PriceList.items))
        .filter(PriceList.id == list_id)
        .first()
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Fiyat listesi bulunamadı")
    return pl


def _replace_items(pl: PriceList, items: list) -> None:
    pl.items.clear()
    for item in items:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        pl.items.append(
            PriceListItem(
                product_id=data.get("product_id"),
                variant_id=data.get("variant_id"),
                description=data["description"],
                unit_price=_d(data.get("unit_price")),
                valid_from=data.get("valid_from"),
                valid_to=data.get("valid_to"),
                notes=data.get("notes"),
            )
        )


@router.get("", response_model=list[PriceListListItem])
def list_price_lists(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
    q: str | None = Query(default=None),
    active_only: bool = False,
) -> list[PriceListListItem]:
    query = db.query(PriceList).options(joinedload(PriceList.items))
    if active_only:
        query = query.filter(PriceList.is_active.is_(True))
    if q:
        like = f"%{q}%"
        query = query.filter((PriceList.name.ilike(like)) | (PriceList.description.ilike(like)))
    rows = query.order_by(PriceList.id.desc()).all()
    return [_to_list(r) for r in rows]


@router.post("", response_model=PriceListOut, status_code=status.HTTP_201_CREATED)
def create_price_list(
    payload: PriceListCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> PriceListOut:
    pl = PriceList(
        name=payload.name.strip(),
        description=payload.description,
        currency=payload.currency or "TRY",
        is_active=payload.is_active,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    db.add(pl)
    db.flush()
    _replace_items(pl, payload.items)
    db.commit()
    out = _to_out(_load(db, pl.id))
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="price_list",
        entity_id=pl.id,
        detail={"name": pl.name},
    )
    return out


@router.get("/{list_id}", response_model=PriceListOut)
def get_price_list(
    list_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> PriceListOut:
    return _to_out(_load(db, list_id))


@router.put("/{list_id}", response_model=PriceListOut)
def update_price_list(
    list_id: int,
    payload: PriceListUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> PriceListOut:
    pl = _load(db, list_id)
    data = payload.model_dump(exclude_unset=True)
    items = data.pop("items", None)
    for k, v in data.items():
        setattr(pl, k, v)
    if items is not None:
        class Wrap:
            def __init__(self, d: dict):
                self._d = d

            def model_dump(self):
                return self._d

        _replace_items(pl, [Wrap(x) for x in items])
    pl.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="price_list",
        entity_id=pl.id,
        detail={"name": pl.name},
    )
    return _to_out(_load(db, pl.id))


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price_list(
    list_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> None:
    pl = _load(db, list_id)
    name = pl.name
    db.delete(pl)
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="price_list",
        entity_id=list_id,
        detail={"name": name},
    )
