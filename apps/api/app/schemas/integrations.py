from pydantic import BaseModel, Field


class BizimHesapSettings(BaseModel):
    api_key: str = ""
    api_secret: str = ""
    configured: bool = False


class BizimHesapSettingsUpdate(BaseModel):
    api_key: str | None = None
    api_secret: str | None = None


class IntegrationActionResult(BaseModel):
    ok: bool
    status: str
    message: str
    detail: dict | None = None
