from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CostItemCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    unit: str | None = "adet"
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    note: str | None = None
    active: bool = True


class CostItemUpdate(BaseModel):
    category: str | None = None
    name: str | None = None
    unit: str | None = None
    unit_cost: Decimal | None = Field(default=None, ge=0)
    note: str | None = None
    active: bool | None = None


class CostItemOut(BaseModel):
    id: int
    category: str
    name: str
    unit: str | None = None
    unit_cost: Decimal
    note: str | None = None
    active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
