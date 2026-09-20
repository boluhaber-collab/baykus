from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class SupplierBase(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = None
    city: str | None = None
    address: str | None = None
    tax_number: str | None = None
    tax_office: str | None = None
    notes: str | None = None
    is_active: bool = True
    opening_balance: Decimal = Decimal("0")


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = None
    city: str | None = None
    address: str | None = None
    tax_number: str | None = None
    tax_office: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    opening_balance: Decimal | None = None


class SupplierOut(SupplierBase):
    id: int
    balance: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SupplierMovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(purchase|payment|adjustment)$")
    amount: Decimal = Field(gt=0)
    movement_date: date | None = None
    purchase_id: int | None = None
    note: str | None = None
    side: str | None = Field(default=None, pattern="^(debit|credit)$")
    post_to_finance: bool = False
    finance_method: str | None = Field(default=None, pattern="^(cash|bank)$")
    bank_account_id: int | None = None


class SupplierMovementOut(BaseModel):
    id: int
    supplier_id: int
    movement_type: str
    debit: Decimal
    credit: Decimal
    movement_date: date
    purchase_id: int | None = None
    purchase_number: str | None = None
    note: str | None = None
    created_at: datetime
    running_balance: Decimal | None = None

    model_config = {"from_attributes": True}


class SupplierStatementOut(BaseModel):
    supplier_id: int
    supplier_name: str
    opening_balance: Decimal
    closing_balance: Decimal
    movements: list[SupplierMovementOut]


class PayableItem(BaseModel):
    supplier_id: int
    code: str | None = None
    name: str
    phone: str | None = None
    city: str | None = None
    balance: Decimal
    last_movement_date: date | None = None


class SupplierPurchaseBrief(BaseModel):
    id: int
    purchase_number: str
    status: str
    total_amount: Decimal
    purchase_date: date
    created_at: datetime


class SupplierDetailOut(SupplierOut):
    recent_purchases: list[SupplierPurchaseBrief] = []
    recent_movements: list[SupplierMovementOut] = []
