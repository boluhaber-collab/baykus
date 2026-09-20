from datetime import date, datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    due_date: date
    due_time: str | None = Field(default=None, max_length=10)
    task_type: str = Field(default="Diğer", max_length=80)
    title: str = Field(min_length=1, max_length=255)
    customer_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    order_number: str | None = Field(default=None, max_length=50)
    priority: str = Field(default="Normal", max_length=20)
    note: str | None = None


class TaskUpdate(BaseModel):
    due_date: date | None = None
    due_time: str | None = None
    task_type: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    customer_name: str | None = None
    phone: str | None = None
    order_number: str | None = None
    status: str | None = None
    priority: str | None = None
    note: str | None = None


class TaskOut(BaseModel):
    id: int
    due_date: date
    due_time: str | None = None
    task_type: str
    title: str
    customer_name: str | None = None
    phone: str | None = None
    order_number: str | None = None
    status: str
    priority: str
    note: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}
