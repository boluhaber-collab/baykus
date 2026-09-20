from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.loan import DEFAULT_LOAN_STATUS, LOAN_STATUSES


class LoanInstallmentOut(BaseModel):
    id: int
    loan_id: int
    sequence: int
    due_date: date
    amount: Decimal
    is_paid: bool
    paid_at: datetime | None = None
    payment_method: str | None = None
    cash_register_id: int | None = None
    bank_account_id: int | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


class LoanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    lender: str | None = None
    principal_amount: Decimal = Field(gt=0)
    interest_rate: Decimal | None = Field(default=None, ge=0)
    start_date: date
    installment_count: int = Field(ge=1, le=120)
    notes: str | None = None
    status: str = DEFAULT_LOAN_STATUS

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in LOAN_STATUSES:
            raise ValueError(f"Geçersiz durum: {', '.join(LOAN_STATUSES)}")
        return v


class LoanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    lender: str | None = None
    interest_rate: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in LOAN_STATUSES:
            raise ValueError(f"Geçersiz durum: {', '.join(LOAN_STATUSES)}")
        return v


class LoanListItem(BaseModel):
    id: int
    title: str
    lender: str | None = None
    principal_amount: Decimal
    interest_rate: Decimal | None = None
    start_date: date
    installment_count: int
    status: str
    notes: str | None = None
    paid_count: int = 0
    unpaid_count: int = 0
    paid_amount: Decimal = Decimal("0")
    remaining_amount: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LoanOut(LoanListItem):
    installments: list[LoanInstallmentOut] = []


class LoanInstallmentPay(BaseModel):
    payment_method: str = Field(description="nakit | banka | none")
    cash_register_id: int | None = None
    bank_account_id: int | None = None
    notes: str | None = None
    post_finance: bool = True

    @field_validator("payment_method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        if v not in ("nakit", "banka", "none"):
            raise ValueError("payment_method: nakit | banka | none")
        return v
