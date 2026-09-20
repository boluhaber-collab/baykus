from datetime import datetime

from pydantic import BaseModel, Field


class DirectoryContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    notes: str | None = None


class DirectoryContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    notes: str | None = None


class DirectoryContactOut(BaseModel):
    id: int
    name: str
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class DirectoryEntry(BaseModel):
    kind: str  # customer | supplier | contact
    id: int
    name: str
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    code: str | None = None
    href: str
    balance: float | None = None
