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


DEFAULT_TEKLIF_SARTLAR = (
    "Tasarım onayı: Baskı / nakış işlemleri öncesinde tarafınızdan onay alınacaktır.\n"
    "Teslim süresi: Ortalama 10 iş günü içinde teslim edilir.\n"
    "Ödeme şartları: %50 kapora, kalan tutar teslimatta nakit, havale ya da kredi kartı ile tahsil edilir.\n"
    "Geçerlilik: Bu teklif oluşturulduğu tarihten itibaren 7 gün geçerlidir."
)
DEFAULT_TEKLIF_KAPANIS = (
    "Kaliteli işçilik, dayanıklı baskı ve nakış çözümleri ile ürünlerinizi "
    "markanıza değer katacak şekilde hazırlamaktan memnuniyet duyarız."
)

DEFAULT_HIZLI = [
    "satis_teklif_olustur",
    "siparis_listesi",
    "atolye_paneli",
    "musteri_merkezi",
    "gider_takibi",
    "urun_stok_merkezi",
    "alis_hareketleri",
]

DEFAULT_SOL_MENU = [
    "Ana Sayfa",
    "Müşteri Merkezi",
    "Tedarik Merkezi",
    "Ürün & Stok Merkezi",
    "Satış / Sipariş",
    "Üretim / Atölye",
    "E-Ticaret",
    "Finans",
    "Fiyat / Maliyet",
    "Raporlar",
    "Müşteri İletişim",
    "Evrak Dolabı",
    "Sistem",
]


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
    # Hızlı İşlemler / Sol Menü / Şablon (non-secret JSON)
    hizli_islemler: list[str] = Field(default_factory=lambda: list(DEFAULT_HIZLI))
    sol_menu_sirasi: list[str] = Field(default_factory=lambda: list(DEFAULT_SOL_MENU))
    sol_menu_adlari: dict[str, str] = Field(default_factory=dict)
    teklif_sablon_adi: str = "Teklif Formu"
    teklif_sablon_baslik: str = "Teklif Formu"
    teklif_sablon_alt_baslik: str = "Kişiye ve Kuruma Özel Baskı Hizmetleri"
    teklif_sablon_logo_goster: str = "Evet"
    teklif_sablon_musteri_goster: str = "Evet"
    teklif_sablon_urun_detay_goster: str = "Evet"
    teklif_sablon_toplam_goster: str = "Evet"
    teklif_sablon_not_goster: str = "Evet"
    teklif_sablon_sartlar_goster: str = "Evet"
    teklif_sablon_sartlar: str = DEFAULT_TEKLIF_SARTLAR
    teklif_sablon_kapanis: str = DEFAULT_TEKLIF_KAPANIS


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
    hizli_islemler: list[str] | None = None
    sol_menu_sirasi: list[str] | None = None
    sol_menu_adlari: dict[str, str] | None = None
    teklif_sablon_adi: str | None = None
    teklif_sablon_baslik: str | None = None
    teklif_sablon_alt_baslik: str | None = None
    teklif_sablon_logo_goster: str | None = None
    teklif_sablon_musteri_goster: str | None = None
    teklif_sablon_urun_detay_goster: str | None = None
    teklif_sablon_toplam_goster: str | None = None
    teklif_sablon_not_goster: str | None = None
    teklif_sablon_sartlar_goster: str | None = None
    teklif_sablon_sartlar: str | None = None
    teklif_sablon_kapanis: str | None = None


class DashboardNote(BaseModel):
    id: str
    text: str
    at: str


class DashboardNotesOut(BaseModel):
    notes: list[DashboardNote] = Field(default_factory=list)


class DashboardNotesUpdate(BaseModel):
    notes: list[DashboardNote] = Field(default_factory=list)


class VariantOptionCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=120)
    note: str | None = None


class VariantOptionUpdate(BaseModel):
    kind: str | None = Field(default=None, min_length=1, max_length=80)
    value: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = None


class VariantOptionOut(BaseModel):
    id: int
    kind: str
    value: str
    note: str | None = None

    model_config = {"from_attributes": True}


class QuickActionItem(BaseModel):
    key: str
    label: str
    href: str
    color: str
    description: str = ""
    fixed: bool = False
