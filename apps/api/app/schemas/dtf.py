from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DtfCalcIn(BaseModel):
    film_m2: Decimal = Field(ge=0)
    film_unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    ink_cost: Decimal = Field(default=Decimal("0"), ge=0)
    labor_cost: Decimal = Field(default=Decimal("0"), ge=0)
    waste_percent: Decimal = Field(default=Decimal("0"), ge=0)
    quantity: int = Field(default=1, ge=1)


class DtfCalcOut(BaseModel):
    film_cost: Decimal
    base_cost: Decimal
    waste_cost: Decimal
    total_cost: Decimal
    unit_cost: Decimal
    quantity: int


class DtfScenarioCreate(DtfCalcIn):
    name: str = Field(min_length=1, max_length=150)
    note: str | None = None


class DtfScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    film_m2: Decimal | None = None
    film_unit_price: Decimal | None = None
    ink_cost: Decimal | None = None
    labor_cost: Decimal | None = None
    waste_percent: Decimal | None = None
    quantity: int | None = Field(default=None, ge=1)
    note: str | None = None


class DtfScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    film_m2: Decimal
    film_unit_price: Decimal
    ink_cost: Decimal
    labor_cost: Decimal
    waste_percent: Decimal
    quantity: int
    note: str | None = None
    unit_cost: Decimal | None = None
    total_cost: Decimal | None = None
    created_at: datetime
    updated_at: datetime
