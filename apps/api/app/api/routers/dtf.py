"""DTF maliyet hesaplayıcı + senaryo kaydı."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.dtf import DtfScenario
from app.models.user import User
from app.schemas.dtf import (
    DtfCalcIn,
    DtfCalcOut,
    DtfScenarioCreate,
    DtfScenarioOut,
    DtfScenarioUpdate,
)

router = APIRouter(prefix="/tools/dtf", tags=["dtf"])

READ = ("admin", "muhasebe", "satış", "üretim")
WRITE = ("admin", "muhasebe", "satış")


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


def _out(row: DtfScenario) -> DtfScenarioOut:
    return DtfScenarioOut.model_validate(row)


@router.post("/calculate", response_model=DtfCalcOut)
def calculate(
    payload: DtfCalcIn,
    _: User = Depends(require_roles(*READ)),
) -> DtfCalcOut:
    return calc(payload)


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
