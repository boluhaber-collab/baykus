from datetime import datetime

from pydantic import BaseModel, Field


class SublimationPrintTimeBase(BaseModel):
    product_name: str = Field(min_length=1, max_length=200)
    size: str | None = Field(default=None, max_length=50)
    minutes: float = Field(default=0, ge=0)
    duration_text: str | None = Field(default=None, max_length=120)
    notes: str | None = None


class SublimationPrintTimeCreate(SublimationPrintTimeBase):
    pass


class SublimationPrintTimeUpdate(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=200)
    size: str | None = None
    minutes: float | None = Field(default=None, ge=0)
    duration_text: str | None = Field(default=None, max_length=120)
    notes: str | None = None


class SublimationPrintTimeOut(SublimationPrintTimeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
