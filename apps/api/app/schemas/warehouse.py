from datetime import datetime

from pydantic import BaseModel, Field


class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=40)
    address: str | None = None
    notes: str | None = None
    is_active: bool = True
    is_default: bool = False


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    code: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    is_default: bool | None = None


class WarehouseOut(BaseModel):
    id: int
    name: str
    code: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool
    is_default: bool
    product_count: int = 0
    stock_qty_total: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class WarehouseTransfer(BaseModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1)
    from_warehouse: str = Field(min_length=1, max_length=100)
    to_warehouse: str = Field(min_length=1, max_length=100)
    note: str | None = None
