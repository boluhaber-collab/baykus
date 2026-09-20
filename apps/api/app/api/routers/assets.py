"""Demirbaşlar CRUD — desktop demirbas_yonetimi."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.asset import ASSET_STATUSES, DEPRECIATION_METHODS, Asset
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


def _maintenance_soon(asset: Asset) -> bool:
    md = asset.maintenance_date
    if not md:
        return False
    today = date.today()
    return today <= md <= today + timedelta(days=30)


def _out(a: Asset) -> AssetOut:
    book, monthly = _book_stats(a)
    cur = a.current_value
    if cur is None and book is not None:
        cur = book
    elif cur is None:
        cur = _d(a.cost)
    return AssetOut(
        id=a.id,
        name=a.name,
        category=a.category,
        serial_no=getattr(a, "serial_no", None),
        purchase_date=a.purchase_date,
        cost=_d(a.cost),
        current_value=_d(cur) if cur is not None else None,
        status=getattr(a, "status", None) or ("Aktif" if a.active else "Hurda"),
        maintenance_date=getattr(a, "maintenance_date", None),
        depreciation_method=a.depreciation_method or "none",
        useful_life_months=a.useful_life_months,
        note=a.note,
        active=bool(a.active),
        book_value=book,
        monthly_depreciation=monthly,
        maintenance_due_soon=_maintenance_soon(a),
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _sync_active_from_status(status_val: str | None, active: bool | None) -> bool:
    if status_val in ("Satıldı", "Hurda"):
        return False
    if active is not None:
        return active
    return True


@router.get("/statuses")
def list_statuses(_: User = Depends(require_roles(*READ))) -> list[str]:
    return list(ASSET_STATUSES)


@router.get("", response_model=list[AssetOut])
def list_assets(
    active: bool | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[AssetOut]:
    query = db.query(Asset).order_by(Asset.id.desc())
    if active is not None:
        query = query.filter(Asset.active.is_(active))
    if status_filter and status_filter != "Tümü":
        query = query.filter(Asset.status == status_filter)
    rows = query.all()
    out = [_out(a) for a in rows]
    if q and q.strip():
        needle = q.strip().casefold()
        out = [
            a
            for a in out
            if needle
            in " ".join(
                [
                    a.name or "",
                    a.category or "",
                    a.serial_no or "",
                    a.status or "",
                    a.note or "",
                ]
            ).casefold()
        ]
    return out


@router.get("/summary")
def assets_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> dict:
    rows = [_out(a) for a in db.query(Asset).all()]
    total_value = sum((_d(r.current_value if r.current_value is not None else r.cost) for r in rows), Decimal("0"))
    soon = sum(1 for r in rows if r.maintenance_due_soon)
    return {
        "count": len(rows),
        "current_value_total": float(total_value),
        "maintenance_due_soon": soon,
    }


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> AssetOut:
    method = payload.depreciation_method or "none"
    if method not in DEPRECIATION_METHODS:
        raise HTTPException(status_code=400, detail="Geçersiz amortisman yöntemi")
    st = payload.status or "Aktif"
    if st not in ASSET_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz durum")
    cur = payload.current_value if payload.current_value is not None else payload.cost
    row = Asset(
        name=payload.name.strip(),
        category=payload.category,
        serial_no=payload.serial_no,
        purchase_date=payload.purchase_date,
        cost=payload.cost,
        current_value=cur,
        status=st,
        maintenance_date=payload.maintenance_date,
        depreciation_method=method,
        useful_life_months=payload.useful_life_months,
        note=payload.note,
        active=_sync_active_from_status(st, payload.active),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)

@router.get("/report/pdf")
def assets_report_pdf(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> Response:
    """Simple demirbaş PDF — not a ReportLab twin of desktop styling."""
    from app.services.pdf import build_assets_report_pdf

    rows = [_out(a) for a in db.query(Asset).order_by(Asset.name).all()]
    pdf = build_assets_report_pdf(
        [
            {
                "name": r.name,
                "category": r.category or "",
                "status": r.status,
                "current_value": float(r.current_value or r.cost or 0),
                "maintenance_date": r.maintenance_date.isoformat() if r.maintenance_date else "",
            }
            for r in rows
        ]
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="demirbas_raporu.pdf"'},
    )


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
    if "status" in data and data["status"] is not None:
        if data["status"] not in ASSET_STATUSES:
            raise HTTPException(status_code=400, detail="Geçersiz durum")
        data["active"] = _sync_active_from_status(data["status"], data.get("active"))
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
