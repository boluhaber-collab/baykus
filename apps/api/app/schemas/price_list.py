from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PriceListItemBase(BaseModel):
    product_id: int | None = None
    variant_id: int | None = None
    description: str = Field(min_length=1, max_length=255)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    supplier_name: str | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    blank_price: Decimal | None = Field(default=None, ge=0)
    printed_price: Decimal | None = Field(default=None, ge=0)
    embroidered_price: Decimal | None = Field(default=None, ge=0)
    valid_from: date | None = None
    valid_to: date | None = None
    notes: str | None = None


class PriceListItemCreate(PriceListItemBase):
    pass


class PriceListItemOut(PriceListItemBase):
    id: int
    price_list_id: int

    model_config = {"from_attributes": True}


class PriceListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    currency: str = "TRY"
    is_active: bool = True
    valid_from: date | None = None
    valid_to: date | None = None
    items: list[PriceListItemCreate] = Field(default_factory=list)


class PriceListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    currency: str | None = None
    is_active: bool | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    items: list[PriceListItemCreate] | None = None


class PriceListListItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    currency: str
    is_active: bool
    valid_from: date | None = None
    valid_to: date | None = None
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PriceListOut(PriceListListItem):
    items: list[PriceListItemOut] = []
