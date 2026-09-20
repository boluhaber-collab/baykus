from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AssetBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str | None = None
    purchase_date: date | None = None
    cost: Decimal = Decimal("0")
    depreciation_method: str = "none"
    useful_life_months: int | None = None
    note: str | None = None
    active: bool = True


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    purchase_date: date | None = None
    cost: Decimal | None = None
    depreciation_method: str | None = None
    useful_life_months: int | None = None
    note: str | None = None
    active: bool | None = None


class AssetOut(AssetBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    book_value: Decimal | None = None
    monthly_depreciation: Decimal | None = None
    created_at: datetime
    updated_at: datetime
