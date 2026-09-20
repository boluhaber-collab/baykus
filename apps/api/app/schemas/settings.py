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
    whatsapp: str = ""
    web_adresi: str = ""
    pdf_alt_baslik: str = ""
    logo_dosyasi: str = ""
    form_logo_dosyasi: str = ""
    theme_label: str = "Varsayılan"
    require_login: str = "Evet"
    user_mode: str = "Yönetici"
    veri_motoru: str = "SQLite"
    postgres_host: str = ""
    postgres_port: str = "5432"
    postgres_db: str = "baykus"
    postgres_user: str = ""
    postgres_ssl: str = "Hayır"


class AppSettingsUpdate(BaseModel):
    company_name: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    web_adresi: str | None = None
    pdf_alt_baslik: str | None = None
    logo_dosyasi: str | None = None
    form_logo_dosyasi: str | None = None
    theme_label: str | None = None
    require_login: str | None = None
    user_mode: str | None = None
    veri_motoru: str | None = None
    postgres_host: str | None = None
    postgres_port: str | None = None
    postgres_db: str | None = None
    postgres_user: str | None = None
    postgres_ssl: str | None = None


class DashboardNote(BaseModel):
    id: str
    text: str
    at: str


class DashboardNotesOut(BaseModel):
    notes: list[DashboardNote] = Field(default_factory=list)


class DashboardNotesUpdate(BaseModel):
    notes: list[DashboardNote] = Field(default_factory=list)
