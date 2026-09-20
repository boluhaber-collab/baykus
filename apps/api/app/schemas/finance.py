from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CashRegisterOut(BaseModel):
    id: int
    name: str
    opening_balance: Decimal
    currency: str
    is_active: bool
    balance: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class CashRegisterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    opening_balance: Decimal | None = None
    is_active: bool | None = None


class CashMovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(tahsilat|odeme|gider|transfer_in|transfer_out)$")
    amount: Decimal = Field(gt=0)
    movement_date: date | None = None
    category: str | None = Field(default=None, max_length=100)
    note: str | None = None
    customer_id: int | None = None
    cash_register_id: int | None = None


class CashMovementOut(BaseModel):
    id: int
    cash_register_id: int
    movement_type: str
    amount: Decimal
    movement_date: date
    category: str | None = None
    note: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    bank_account_id: int | None = None
    bank_account_name: str | None = None
    transfer_group_id: str | None = None
    cari_movement_id: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime
    running_balance: Decimal | None = None
    direction: str  # "in" | "out"

    model_config = {"from_attributes": True}


class BankAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    iban: str | None = Field(default=None, max_length=34)
    currency: str = Field(default="TRY", max_length=3)
    opening_balance: Decimal = Decimal("0")
    is_active: bool = True
    notes: str | None = None


class BankAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    iban: str | None = Field(default=None, max_length=34)
    currency: str | None = Field(default=None, max_length=3)
    opening_balance: Decimal | None = None
    is_active: bool | None = None
    notes: str | None = None


class BankAccountOut(BaseModel):
    id: int
    name: str
    iban: str | None = None
    currency: str
    opening_balance: Decimal
    is_active: bool
    notes: str | None = None
    balance: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BankMovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(deposit|withdrawal|transfer_in|transfer_out|fee)$")
    amount: Decimal = Field(gt=0)
    movement_date: date | None = None
    category: str | None = Field(default=None, max_length=100)
    note: str | None = None
    customer_id: int | None = None


class BankMovementOut(BaseModel):
    id: int
    bank_account_id: int
    bank_account_name: str | None = None
    movement_type: str
    amount: Decimal
    movement_date: date
    category: str | None = None
    note: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    cash_register_id: int | None = None
    counterpart_bank_account_id: int | None = None
    transfer_group_id: str | None = None
    cari_movement_id: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime
    running_balance: Decimal | None = None
    direction: str  # "in" | "out"

    model_config = {"from_attributes": True}


class TransferCreate(BaseModel):
    """Transfer between cash↔bank or bank↔bank."""

    amount: Decimal = Field(gt=0)
    movement_date: date | None = None
    note: str | None = None
    # Source: "cash" or bank account id
    from_cash: bool = False
    from_bank_account_id: int | None = None
    # Destination
    to_cash: bool = False
    to_bank_account_id: int | None = None
    cash_register_id: int | None = None


class TransferOut(BaseModel):
    transfer_group_id: str
    amount: Decimal
    movement_date: date
    note: str | None = None
    cash_movements: list[CashMovementOut] = []
    bank_movements: list[BankMovementOut] = []


class RecentMovement(BaseModel):
    source: str  # "cash" | "bank"
    id: int
    movement_type: str
    amount: Decimal
    movement_date: date
    note: str | None = None
    account_name: str | None = None
    direction: str
    created_at: datetime


class FinanceSummary(BaseModel):
    total_cash: Decimal
    total_bank: Decimal
    total_liquidity: Decimal
    cash_registers: list[CashRegisterOut]
    bank_accounts: list[BankAccountOut]
    today_cash_in: Decimal
    today_cash_out: Decimal
    today_bank_in: Decimal
    today_bank_out: Decimal
    today_movements_count: int
    recent_movements: list[RecentMovement]
    receivables: Decimal | None = None  # from cari if available
