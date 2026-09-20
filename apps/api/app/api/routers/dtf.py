"""DTF maliyet hesaplayıcı — masaüstü metretül + film senaryoları."""

from __future__ import annotations

import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.cost_item import CostItem
from app.models.dtf import DtfScenario
from app.models.settings_model import AppSetting
from app.models.user import User
from app.schemas.dtf import (
    DtfCalcIn,
    DtfCalcOut,
    DtfDesktopCalcIn,
    DtfDesktopCalcOut,
    DtfScenarioCreate,
    DtfScenarioOut,
    DtfScenarioUpdate,
    DtfSettings,
)

router = APIRouter(prefix="/tools/dtf", tags=["dtf"])

READ = ("admin", "muhasebe", "satış", "üretim")
WRITE = ("admin", "muhasebe", "satış")
SETTINGS_KEY = "dtf_desktop_defaults"


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def calc(payload: DtfCalcIn) -> DtfCalcOut:
    film = (_d(payload.film_m2) * _d(payload.film_unit_price)).quantize(Decimal("0.01"))
    base = (film + _d(payload.ink_cost) + _d(payload.labor_cost)).quantize(Decimal("0.01"))
    waste = (base * _d(payload.waste_percent) / Decimal("100")).quantize(Decimal("0.01"))
    total = (base + waste).quantize(Decimal("0.01"))
    qty = max(1, int(payload.quantity or 1))
    unit = (total / Decimal(qty)).quantize(Decimal("0.0001"))
    return DtfCalcOut(
        film_cost=film,
        base_cost=base,
        waste_cost=waste,
        total_cost=total,
        unit_cost=unit,
        quantity=qty,
    )


def calc_desktop(payload: DtfDesktopCalcIn) -> DtfDesktopCalcOut:
    metretul = _d(payload.metretul)
    alis = _d(payload.alis_usd_mt)
    satis = _d(payload.satis_usd_mt)
    kur = _d(payload.kur)
    alis_usd = (metretul * alis).quantize(Decimal("0.01"))
    satis_usd = (metretul * satis).quantize(Decimal("0.01"))
    kar_usd = (satis_usd - alis_usd).quantize(Decimal("0.01"))
    alis_tl = (alis_usd * kur).quantize(Decimal("0.01"))
    satis_tl = (satis_usd * kur).quantize(Decimal("0.01"))
    kar_tl = (kar_usd * kur).quantize(Decimal("0.01"))
    marj = (
        ((kar_tl / satis_tl) * Decimal("100")).quantize(Decimal("0.1")) if satis_tl else Decimal("0")
    )
    birim = (alis_tl / metretul).quantize(Decimal("0.01")) if metretul else Decimal("0")
    return DtfDesktopCalcOut(
        metretul=metretul,
        alis_usd=alis_usd,
        satis_usd=satis_usd,
        kar_usd=kar_usd,
        alis_tl=alis_tl,
        satis_tl=satis_tl,
        kar_tl=kar_tl,
        kar_marji=marj,
        birim_alis_tl=birim,
    )


def _out(row: DtfScenario) -> DtfScenarioOut:
    return DtfScenarioOut.model_validate(row)


@router.post("/calculate", response_model=DtfCalcOut)
def calculate(
    payload: DtfCalcIn,
    _: User = Depends(require_roles(*READ)),
) -> DtfCalcOut:
    return calc(payload)


@router.post("/desktop-calculate", response_model=DtfDesktopCalcOut)
def desktop_calculate(
    payload: DtfDesktopCalcIn,
    _: User = Depends(require_roles(*READ)),
) -> DtfDesktopCalcOut:
    """Masaüstü DTF Maliyet & Satış Hesaplama."""
    return calc_desktop(payload)


@router.get("/settings", response_model=DtfSettings)
def get_dtf_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> DtfSettings:
    row = db.query(AppSetting).filter(AppSetting.key == SETTINGS_KEY).first()
    if not row or not row.value:
        return DtfSettings()
    try:
        data = json.loads(row.value)
        return DtfSettings(**data)
    except Exception:
        return DtfSettings()


@router.put("/settings", response_model=DtfSettings)
def put_dtf_settings(
    payload: DtfSettings,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DtfSettings:
    raw = payload.model_dump(mode="json")
    row = db.query(AppSetting).filter(AppSetting.key == SETTINGS_KEY).first()
    if row:
        row.value = json.dumps(raw)
    else:
        db.add(AppSetting(key=SETTINGS_KEY, value=json.dumps(raw)))
    db.commit()
    return payload


@router.post("/to-costs")
def transfer_to_costs(
    payload: DtfDesktopCalcIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> dict:
    """Maliyete Aktar — DTF kategori kalemlerini günceller (masaüstü maliyete_aktar)."""
    result = calc_desktop(payload)
    if result.alis_tl <= 0 or result.metretul <= 0:
        raise HTTPException(status_code=400, detail="Önce geçerli hesaplama yapın")
    # Remove existing DTF auto rows
    for old in db.query(CostItem).filter(CostItem.category == "DTF").all():
        if old.name in (
            "Film + Baskı Birim Maliyet (TL/mt)",
            "Son Hesap Toplam Alış",
            "Son Hesap Metretül",
        ):
            db.delete(old)
    items = [
        CostItem(
            category="DTF",
            name="Film + Baskı Birim Maliyet (TL/mt)",
            unit="mt",
            unit_cost=result.birim_alis_tl,
            note="DTF hesaplayıcıdan aktarıldı",
            active=True,
        ),
        CostItem(
            category="DTF",
            name="Son Hesap Toplam Alış",
            unit="toplam",
            unit_cost=result.alis_tl,
            note="DTF hesaplayıcıdan aktarıldı",
            active=True,
        ),
        CostItem(
            category="DTF",
            name="Son Hesap Metretül",
            unit="mt",
            unit_cost=result.metretul,
            note="DTF hesaplayıcıdan aktarıldı",
            active=True,
        ),
    ]
    for it in items:
        db.add(it)
    db.commit()
    return {
        "ok": True,
        "message": "DTF maliyet bilgisi Maliyet Yönetimi ekranına aktarıldı.",
        "birim_alis_tl": float(result.birim_alis_tl),
        "alis_tl": float(result.alis_tl),
        "metretul": float(result.metretul),
    }


@router.get("/scenarios", response_model=list[DtfScenarioOut])
def list_scenarios(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[DtfScenarioOut]:
    rows = db.query(DtfScenario).order_by(DtfScenario.updated_at.desc()).all()
    return [_out(r) for r in rows]


@router.post("/scenarios", response_model=DtfScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(
    payload: DtfScenarioCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DtfScenarioOut:
    result = calc(payload)
    row = DtfScenario(
        name=payload.name.strip(),
        film_m2=payload.film_m2,
        film_unit_price=payload.film_unit_price,
        ink_cost=payload.ink_cost,
        labor_cost=payload.labor_cost,
        waste_percent=payload.waste_percent,
        quantity=payload.quantity,
        note=payload.note,
        unit_cost=result.unit_cost,
        total_cost=result.total_cost,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.put("/scenarios/{scenario_id}", response_model=DtfScenarioOut)
def update_scenario(
    scenario_id: int,
    payload: DtfScenarioUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DtfScenarioOut:
    row = db.get(DtfScenario, scenario_id)
    if not row:
        raise HTTPException(status_code=404, detail="Senaryo bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    result = calc(
        DtfCalcIn(
            film_m2=row.film_m2,
            film_unit_price=row.film_unit_price,
            ink_cost=row.ink_cost,
            labor_cost=row.labor_cost,
            waste_percent=row.waste_percent,
            quantity=row.quantity,
        )
    )
    row.unit_cost = result.unit_cost
    row.total_cost = result.total_cost
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(DtfScenario, scenario_id)
    if not row:
        raise HTTPException(status_code=404, detail="Senaryo bulunamadı")
    db.delete(row)
    db.commit()
