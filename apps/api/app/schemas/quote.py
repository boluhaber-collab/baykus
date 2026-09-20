from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.quote import DEFAULT_QUOTE_STATUS, QUOTE_STATUSES


class QuoteLineBase(BaseModel):
    product_id: int | None = None
    variant_id: int | None = None
    description: str = Field(min_length=1, max_length=255)
    quantity: int = Field(default=1, ge=1)
    size: str | None = None
    color: str | None = None
    print_type: str | None = None
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)


class QuoteLineCreate(QuoteLineBase):
    pass


class QuoteLineOut(QuoteLineBase):
    id: int
    line_total: Decimal

    model_config = {"from_attributes": True}


class QuoteCreate(BaseModel):
    customer_id: int | None = None
    quote_number: str | None = Field(default=None, max_length=50)
    status: str = DEFAULT_QUOTE_STATUS
    notes: str | None = None
    valid_until: date | None = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    lines: list[QuoteLineCreate] = Field(default_factory=list, min_length=1)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in QUOTE_STATUSES:
            raise ValueError(f"Geçersiz durum. İzin verilen: {', '.join(QUOTE_STATUSES)}")
        return v


class QuoteUpdate(BaseModel):
    customer_id: int | None = None
    quote_number: str | None = Field(default=None, max_length=50)
    status: str | None = None
    notes: str | None = None
    valid_until: date | None = None
    discount_amount: Decimal | None = Field(default=None, ge=0)
    lines: list[QuoteLineCreate] | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in QUOTE_STATUSES:
            raise ValueError(f"Geçersiz durum. İzin verilen: {', '.join(QUOTE_STATUSES)}")
        return v


class QuoteListItem(BaseModel):
    id: int
    quote_number: str
    customer_id: int | None
    customer_name: str | None = None
    status: str
    total_amount: Decimal
    discount_amount: Decimal
    valid_until: date | None = None
    notes: str | None = None
    converted_order_id: int | None = None
    is_cancelled: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuoteOut(QuoteListItem):
    lines: list[QuoteLineOut] = []


class QuoteConvertOut(BaseModel):
    quote: QuoteOut
    order_id: int
    order_number: str
