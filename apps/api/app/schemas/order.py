from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.order import (
    DEFAULT_ORDER_STATUS,
    DESIGN_STATUSES,
    ORDER_CHANNELS,
    ORDER_STATUSES,
)


class OrderLineBase(BaseModel):
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


class OrderLineCreate(OrderLineBase):
    pass


class OrderLineOut(OrderLineBase):
    id: int
    line_total: Decimal

    model_config = {"from_attributes": True}


class PaymentOut(BaseModel):
    id: int
    amount: Decimal
    method: str
    status: str
    paid_at: datetime
    notes: str | None = None

    model_config = {"from_attributes": True}


class OrderStatusHistoryOut(BaseModel):
    id: int
    from_status: str | None
    to_status: str
    note: str | None
    changed_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    customer_id: int | None = None
    order_number: str | None = Field(default=None, max_length=50)
    status: str = DEFAULT_ORDER_STATUS
    notes: str | None = None
    due_date: date | None = None
    delivery_date: date | None = None
    channel: str = "mağaza"
    design_status: str = "bekliyor"
    design_notes: str | None = None
    deposit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    lines: list[OrderLineCreate] = Field(default_factory=list, min_length=1)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ORDER_STATUSES:
            raise ValueError(f"Geçersiz durum. İzin verilen: {', '.join(ORDER_STATUSES)}")
        return v


class OrderUpdate(BaseModel):
    customer_id: int | None = None
    order_number: str | None = Field(default=None, max_length=50)
    status: str | None = None
    notes: str | None = None
    due_date: date | None = None
    delivery_date: date | None = None
    channel: str | None = None
    design_status: str | None = None
    design_notes: str | None = None
    deposit_amount: Decimal | None = Field(default=None, ge=0)
    discount_amount: Decimal | None = Field(default=None, ge=0)
    lines: list[OrderLineCreate] | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ORDER_STATUSES:
            raise ValueError(f"Geçersiz durum. İzin verilen: {', '.join(ORDER_STATUSES)}")
        return v


class OrderStatusChange(BaseModel):
    status: str
    note: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ORDER_STATUSES:
            raise ValueError(f"Geçersiz durum. İzin verilen: {', '.join(ORDER_STATUSES)}")
        return v


class OrderListItem(BaseModel):
    id: int
    order_number: str
    customer_id: int | None
    customer_name: str | None = None
    status: str
    total_amount: Decimal
    deposit_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    due_date: date | None = None
    delivery_date: date | None = None
    channel: str | None = None
    design_status: str | None = None
    design_notes: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrderOut(OrderListItem):
    discount_amount: Decimal
    lines: list[OrderLineOut] = []
    payments: list[PaymentOut] = []
    status_history: list[OrderStatusHistoryOut] = []


class KanbanCard(BaseModel):
    id: int
    order_number: str
    customer_name: str | None = None
    status: str
    total_amount: float
    remaining_amount: float
    due_date: date | None = None
    channel: str | None = None
    design_status: str | None = None


class KanbanColumn(BaseModel):
    key: str
    label: str
    items: list[KanbanCard]


class KanbanBoard(BaseModel):
    columns: list[KanbanColumn]
