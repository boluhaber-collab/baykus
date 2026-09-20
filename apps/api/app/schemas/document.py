from datetime import datetime

from pydantic import BaseModel, Field


class DocumentCreateMeta(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category: str | None = None
    notes: str | None = None
    archive_tag: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    notes: str | None = None
    archive_tag: str | None = None


class DocumentOut(BaseModel):
    id: int
    title: str
    category: str | None = None
    original_filename: str
    content_type: str | None = None
    size_bytes: int
    notes: str | None = None
    archive_tag: str | None = None
    uploaded_by_user_id: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
