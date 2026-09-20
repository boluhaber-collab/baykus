"""Özel günler ve kampanyalar."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.crm import SPECIAL_DAY_TYPES, Campaign, SpecialDay
from app.models.customer import Customer
from app.models.user import User
from app.schemas.crm import (
    CampaignCreate,
    CampaignOut,
    CampaignUpdate,
    SpecialDayCreate,
    SpecialDayOut,
    SpecialDayUpdate,
)

router = APIRouter(prefix="/crm", tags=["crm"])

READ = ("admin", "satış", "muhasebe")
WRITE = ("admin", "satış")


def _days_until(event: date, today: date | None = None) -> int:
    """Next occurrence of month/day within the year cycle."""
    today = today or date.today()
    try:
        this_year = event.replace(year=today.year)
    except ValueError:
        # Feb 29 → Feb 28 non-leap
        this_year = date(today.year, event.month, 28)
    if this_year < today:
        try:
            this_year = event.replace(year=today.year + 1)
        except ValueError:
            this_year = date(today.year + 1, event.month, 28)
    return (this_year - today).days


def _special_out(row: SpecialDay, today: date | None = None) -> SpecialDayOut:
    return SpecialDayOut(
        id=row.id,
        name=row.name,
        event_date=row.event_date,
        day_type=row.day_type,
        customer_id=row.customer_id,
        note=row.note,
        active=bool(row.active),
        customer_name=row.customer.name if row.customer is not None else None,
        days_until=_days_until(row.event_date, today),
        created_at=row.created_at,
    )


@router.get("/special-days", response_model=list[SpecialDayOut])
def list_special_days(
    upcoming_days: int | None = Query(default=None, ge=1, le=366),
    active: bool | None = Query(default=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[SpecialDayOut]:
    today = date.today()
    q = db.query(SpecialDay).order_by(SpecialDay.event_date)
    if active is not None:
        q = q.filter(SpecialDay.active.is_(active))
    rows = q.all()
    out = [_special_out(r, today) for r in rows]
    if upcoming_days is not None:
        out = [o for o in out if o.days_until is not None and 0 <= o.days_until <= upcoming_days]
        out.sort(key=lambda x: x.days_until or 999)
    return out


@router.post("/special-days", response_model=SpecialDayOut, status_code=status.HTTP_201_CREATED)
def create_special_day(
    payload: SpecialDayCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> SpecialDayOut:
    day_type = (payload.day_type or "diğer").strip()
    if day_type not in SPECIAL_DAY_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz tür")
    if payload.customer_id and not db.get(Customer, payload.customer_id):
        raise HTTPException(status_code=400, detail="Müşteri bulunamadı")
    row = SpecialDay(
        name=payload.name.strip(),
        event_date=payload.event_date,
        day_type=day_type,
        customer_id=payload.customer_id,
        note=payload.note,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _special_out(row)


@router.put("/special-days/{item_id}", response_model=SpecialDayOut)
def update_special_day(
    item_id: int,
    payload: SpecialDayUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> SpecialDayOut:
    row = db.get(SpecialDay, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Özel gün bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "day_type" in data and data["day_type"] is not None:
        if data["day_type"] not in SPECIAL_DAY_TYPES:
            raise HTTPException(status_code=400, detail="Geçersiz tür")
    if "customer_id" in data and data["customer_id"]:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(status_code=400, detail="Müşteri bulunamadı")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _special_out(row)


@router.delete("/special-days/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_special_day(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(SpecialDay, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Özel gün bulunamadı")
    db.delete(row)
    db.commit()


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(
    active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[CampaignOut]:
    q = db.query(Campaign).order_by(Campaign.id.desc())
    if active is not None:
        q = q.filter(Campaign.active.is_(active))
    return [CampaignOut.model_validate(r) for r in q.all()]


@router.post("/campaigns", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> CampaignOut:
    row = Campaign(
        title=payload.title.strip(),
        message_template=payload.message_template or "",
        start_date=payload.start_date,
        end_date=payload.end_date,
        active=payload.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CampaignOut.model_validate(row)


@router.put("/campaigns/{item_id}", response_model=CampaignOut)
def update_campaign(
    item_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> CampaignOut:
    row = db.get(Campaign, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return CampaignOut.model_validate(row)


@router.delete("/campaigns/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(Campaign, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    db.delete(row)
    db.commit()
