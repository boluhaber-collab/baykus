from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.whatsapp import WA_CATEGORIES


class WhatsAppTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str
    body: str = Field(min_length=1)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in WA_CATEGORIES:
            raise ValueError(f"Geçersiz kategori. İzin verilen: {', '.join(WA_CATEGORIES)}")
        return v


class WhatsAppTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = None
    body: str | None = Field(default=None, min_length=1)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is not None and v not in WA_CATEGORIES:
            raise ValueError(f"Geçersiz kategori. İzin verilen: {', '.join(WA_CATEGORIES)}")
        return v


class WhatsAppTemplateOut(BaseModel):
    id: int
    name: str
    category: str
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WhatsAppPreviewRequest(BaseModel):
    template_id: int | None = None
    body: str | None = None
    phone: str = Field(min_length=7, max_length=30)
    placeholders: dict[str, str] = Field(default_factory=dict)


class WhatsAppPreviewOut(BaseModel):
    rendered_body: str
    wa_link: str
    phone: str


class WhatsAppLogCreate(BaseModel):
    template_id: int | None = None
    phone: str
    rendered_body: str
    wa_link: str
    customer_name: str | None = None


class WhatsAppLogOut(BaseModel):
    id: int
    template_id: int | None
    template_name: str | None = None
    phone: str
    rendered_body: str
    wa_link: str
    customer_name: str | None
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
