from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class CustomerBase(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    company: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    city: str | None = None
    address: str | None = None
    tax_number: str | None = None
    tax_office: str | None = None
    notes: str | None = None
    is_active: bool = True
    special_day_note: str | None = None
    special_day_date: date | None = None
    opening_balance: Decimal = Decimal("0")


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    company: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    city: str | None = None
    address: str | None = None
    tax_number: str | None = None
    tax_office: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    special_day_note: str | None = None
    special_day_date: date | None = None
    opening_balance: Decimal | None = None


class CustomerOut(CustomerBase):
    id: int
    balance: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CariMovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(sale|payment|adjustment|deposit)$")
    amount: Decimal = Field(gt=0)
    movement_date: date | None = None
    order_id: int | None = None
    note: str | None = None
    # For adjustment: "debit" (borç) or "credit" (alacak). Ignored for other types.
    side: str | None = Field(default=None, pattern="^(debit|credit)$")
    # Optional: also post cash/bank movement when recording payment/deposit
    post_to_finance: bool = False
    finance_method: str | None = Field(default=None, pattern="^(cash|bank)$")
    bank_account_id: int | None = None


class CariMovementOut(BaseModel):
    id: int
    customer_id: int
    movement_type: str
    debit: Decimal
    credit: Decimal
    movement_date: date
    order_id: int | None = None
    order_number: str | None = None
    note: str | None = None
    created_at: datetime
    running_balance: Decimal | None = None

    model_config = {"from_attributes": True}


class StatementOut(BaseModel):
    customer_id: int
    customer_name: str
    opening_balance: Decimal
    closing_balance: Decimal
    movements: list[CariMovementOut]


class ReceivableItem(BaseModel):
    customer_id: int
    code: str | None = None
    name: str
    company: str | None = None
    phone: str | None = None
    city: str | None = None
    balance: Decimal
    last_movement_date: date | None = None


class CustomerOrderBrief(BaseModel):
    id: int
    order_number: str
    status: str
    total_amount: Decimal
    remaining_amount: Decimal
    due_date: date | None = None
    created_at: datetime



class CustomerQuoteBrief(BaseModel):
    id: int
    quote_number: str
    status: str
    total_amount: Decimal
    valid_until: date | None = None
    created_at: datetime


class CustomerDetailOut(CustomerOut):
    recent_orders: list[CustomerOrderBrief] = []
    recent_quotes: list[CustomerQuoteBrief] = []
    recent_movements: list[CariMovementOut] = []
    timeline: list[dict] = []


class CustomerTahsilatIn(BaseModel):
    """Desktop tahsilat_penceresi — tutar + ödeme türü + kasa/banka + açık siparişlere işle."""

    amount: Decimal = Field(gt=0)
    payment_type: str = Field(default="Nakit")  # Nakit | EFT | Kredi Kartı | Diğer
    bank_account_id: int | None = None
    note: str | None = None
    movement_date: date | None = None
    apply_to_open_orders: bool = True
    # Optional second payment line (desktop ikinci ödeme)
    amount2: Decimal | None = Field(default=None, gt=0)
    payment_type2: str | None = None
    bank_account_id2: int | None = None


class CustomerTahsilatOut(BaseModel):
    cari_movement_ids: list[int]
    total_amount: Decimal
    applied_to_orders: Decimal
    finance_posted: bool
    message: str


class CustomerDevirIn(BaseModel):
    """Desktop devir_bakiye_duzenle — signed opening balance."""

    amount: Decimal = Field(ge=0)
    direction: str = Field(pattern="^(borclu|alacakli)$")  # Müşteri Borçlu | Alacaklı
