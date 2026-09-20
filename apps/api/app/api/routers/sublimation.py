"""Sublimasyon baskı süreleri CRUD — masaüstü Ürün / Baskı Süresi / Diğer Talimatlar."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim")),
) -> list[SublimationPrintTimeOut]:
    query = db.query(SublimationPrintTime).order_by(
        SublimationPrintTime.product_name, SublimationPrintTime.size
    )
    rows = query.all()
    if q:
        needle = q.strip().casefold()
        parts = [p for p in needle.split() if p]

        def match(r: SublimationPrintTime) -> bool:
            blob = " ".join(
                [
                    r.product_name or "",
                    r.size or "",
                    r.duration_text or "",
                    str(r.minutes or ""),
                    r.notes or "",
                ]
            ).casefold()
            return all(p in blob for p in parts)

        rows = [r for r in rows if match(r)]
    return rows


@router.post("", response_model=SublimationPrintTimeOut, status_code=status.HTTP_201_CREATED)
def create_time(
    payload: SublimationPrintTimeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> SublimationPrintTimeOut:
    data = payload.model_dump()
    # duration_text yoksa minutes'tan üret
    if not data.get("duration_text") and data.get("minutes"):
        data["duration_text"] = f"{data['minutes']:g} dk"
    row = SublimationPrintTime(**data)
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
