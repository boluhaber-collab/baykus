from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    email: str
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=100)
    roles: list[str] = Field(default_factory=list)
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    roles: list[str] | None = None
    is_active: bool | None = None


class PasswordChange(BaseModel):
    new_password: str = Field(min_length=6, max_length=100)


class AppSettingsOut(BaseModel):
    company_name: str = "Baykuş Baskı"
    phone: str = ""
    theme_label: str = "Varsayılan"


class AppSettingsUpdate(BaseModel):
    company_name: str | None = None
    phone: str | None = None
    theme_label: str | None = None
