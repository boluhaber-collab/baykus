from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SpecialDayBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    event_date: date
    day_type: str = "diğer"
    customer_id: int | None = None
    note: str | None = None
    active: bool = True


class SpecialDayCreate(SpecialDayBase):
    pass


class SpecialDayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    event_date: date | None = None
    day_type: str | None = None
    customer_id: int | None = None
    note: str | None = None
    active: bool | None = None


class SpecialDayOut(SpecialDayBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_name: str | None = None
    days_until: int | None = None
    created_at: datetime


class CampaignBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message_template: str = ""
    start_date: date | None = None
    end_date: date | None = None
    active: bool = True


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    message_template: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    active: bool | None = None


class CampaignOut(CampaignBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
