from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.expense import EXPENSE_PAYMENT_METHODS


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    group_name: str | None = Field(default="İşletme Giderleri", max_length=100)
    description: str | None = None
    is_active: bool = True


class ExpenseCategoryOut(BaseModel):
    id: int
    name: str
    group_name: str | None = None
    description: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    group_name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ExpenseCreate(BaseModel):
    category_id: int
    amount: Decimal = Field(gt=0)
    expense_date: date
    due_date: date | None = None
    document_no: str | None = Field(default=None, max_length=50)
    payment_method: str = "nakit"
    note: str | None = None
    cash_register_id: int | None = None
    bank_account_id: int | None = None
    post_immediately: bool = True

    @field_validator("payment_method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        if v not in EXPENSE_PAYMENT_METHODS:
            raise ValueError(f"Geçersiz ödeme yöntemi: {', '.join(EXPENSE_PAYMENT_METHODS)}")
        return v


class ExpenseOut(BaseModel):
    id: int
    category_id: int
    category_name: str | None = None
    amount: Decimal
    expense_date: date
    due_date: date | None = None
    document_no: str | None = None
    payment_method: str
    note: str | None
    cash_register_id: int | None
    bank_account_id: int | None
    is_posted: bool
    status_label: str | None = None  # Ödenmiş | Ödenecek | Gecikmiş
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
