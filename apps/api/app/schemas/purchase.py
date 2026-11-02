from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class PurchaseLineIn(BaseModel):
    product_id: int | None = None
    variant_id: int | None = None
    description: str = Field(min_length=1, max_length=255)
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    line_note: str | None = Field(default=None, max_length=2000)
    # Satır indirimi (₺) — unit_cost brüt birim fiyattır
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    # KDV oranı (%). None → eski davranış (KDV başlıktaki tax_amount ile gelir)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    # Elle KDV tutarı (eski kayıtlarda dağıtılmış başlık KDV'si); verilirse orandan hesaplanmaz
    tax_amount: Decimal | None = Field(default=None, ge=0)


class PurchaseLineOut(BaseModel):
    id: int
    product_id: int | None = None
    variant_id: int | None = None
    description: str
    quantity: Decimal
    unit_cost: Decimal
    line_total: Decimal
    line_note: str | None = None
    discount_amount: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    product_name: str | None = None
    variant_name: str | None = None

    model_config = {"from_attributes": True}


class PurchaseCreate(BaseModel):
    supplier_id: int
    purchase_date: date | None = None
    purchase_number: str | None = None
    notes: str | None = None
    tax_amount: Decimal = Decimal("0")
    discount_type: Literal["amount", "percent"] = "amount"
    discount_value: Decimal = Field(default=Decimal("0"), ge=0)
    lines: list[PurchaseLineIn] = Field(min_length=1)
    confirm: bool = False


class PurchaseUpdate(BaseModel):
    supplier_id: int | None = None
    purchase_date: date | None = None
    notes: str | None = None
    tax_amount: Decimal | None = None
    discount_type: Literal["amount", "percent"] | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)
    lines: list[PurchaseLineIn] | None = None


class PurchaseListItem(BaseModel):
    id: int
    purchase_number: str
    supplier_id: int
    supplier_name: str
    purchase_date: date
    status: str
    subtotal: Decimal
    tax_amount: Decimal
    discount_type: str = "amount"
    discount_value: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    total_amount: Decimal
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseOut(PurchaseListItem):
    lines: list[PurchaseLineOut] = []
    confirmed_at: datetime | None = None
    updated_at: datetime
