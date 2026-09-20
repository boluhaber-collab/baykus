"""Sublimasyon baskı süreleri CRUD."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.sublimation import SublimationPrintTime
from app.models.user import User
from app.schemas.sublimation import (
    SublimationPrintTimeCreate,
    SublimationPrintTimeOut,
    SublimationPrintTimeUpdate,
)

router = APIRouter(prefix="/production/sublimation", tags=["sublimation"])


@router.get("", response_model=list[SublimationPrintTimeOut])
def list_times(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> list[SublimationPrintTimeOut]:
    rows = (
        db.query(SublimationPrintTime)
        .order_by(SublimationPrintTime.product_name, SublimationPrintTime.size)
        .all()
    )
    return rows


@router.post("", response_model=SublimationPrintTimeOut, status_code=status.HTTP_201_CREATED)
def create_time(
    payload: SublimationPrintTimeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> SublimationPrintTimeOut:
    row = SublimationPrintTime(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{item_id}", response_model=SublimationPrintTimeOut)
def update_time(
    item_id: int,
    payload: SublimationPrintTimeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> SublimationPrintTimeOut:
    row = db.get(SublimationPrintTime, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> None:
    row = db.get(SublimationPrintTime, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    db.delete(row)
    db.commit()
