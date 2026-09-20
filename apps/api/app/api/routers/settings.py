"""Ayarlar: kullanıcılar, roller, uygulama ayarları, varyant kataloğu."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.security import hash_password
from app.models.settings_model import AppSetting
from app.models.user import Role, User
from app.models.variant_option import VariantOption
from app.schemas.auth import UserOut
from app.schemas.settings import (
    DEFAULT_HIZLI,
    DEFAULT_SOL_MENU,
    DEFAULT_TEKLIF_KAPANIS,
    DEFAULT_TEKLIF_SARTLAR,
    AppSettingsOut,
    AppSettingsUpdate,
    PasswordChange,
    QuickActionItem,
    UserCreate,
    UserUpdate,
    VariantOptionCreate,
    VariantOptionOut,
    VariantOptionUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SETTING_KEYS = (
    "company_name", "phone", "whatsapp", "web_adresi", "pdf_alt_baslik",
    "logo_dosyasi", "form_logo_dosyasi",
    "theme_label", "require_login", "user_mode", "veri_motoru",
    "postgres_host", "postgres_port", "postgres_db", "postgres_user", "postgres_ssl",
    "merkezi_db_turu", "sunucu_lokasyon",
    "teklif_sablon_adi", "teklif_sablon_baslik", "teklif_sablon_alt_baslik",
    "teklif_sablon_logo_goster", "teklif_sablon_musteri_goster",
    "teklif_sablon_urun_detay_goster", "teklif_sablon_toplam_goster",
    "teklif_sablon_not_goster", "teklif_sablon_sartlar_goster",
    "teklif_sablon_sartlar", "teklif_sablon_kapanis",
)

JSON_KEYS = ("hizli_islemler", "sol_menu_sirasi", "sol_menu_adlari")

# Secrets / API keys never stored via this router (BizimHesap lives under integrations).

QUICK_CATALOG: list[QuickActionItem] = [
    QuickActionItem(key="satis_teklif_olustur", label="Satış / Teklif Oluştur", href="/sales/create", color="#1f6feb", description="Yeni satış veya teklif kaydı oluşturun."),
    QuickActionItem(key="teklif_listesi", label="Teklifler", href="/quotes", color="#7c3aed", description="Hazırlanan teklifleri görüntüleyin."),
    QuickActionItem(key="siparis_listesi", label="Sipariş Listesi", href="/orders", color="#0f766e", description="Sipariş durumlarını ve teslimleri takip edin."),
    QuickActionItem(key="akis_paneli", label="Sipariş Merkezi", href="/orders", color="#111827", description="Sipariş sürecini tek ekrandan yönetin."),
    QuickActionItem(key="atolye_paneli", label="Üretim Akış Paneli", href="/production", color="#f59e0b", description="Üretimdeki işleri ve aşamaları izleyin."),
    QuickActionItem(key="is_emirleri", label="İş Emirleri", href="/production/work-orders", color="#2563eb", description="İş emirlerine hızlı erişim sağlayın."),
    QuickActionItem(key="musteri_merkezi", label="Müşteri Merkezi", href="/customers", color="#198754", description="Müşteri ve cari işlemlerini yönetin."),
    QuickActionItem(key="musteri_iletisim", label="Müşteri İletişim", href="/communication", color="#0f766e", description="Kampanya, WhatsApp ve fihrist araçlarını açın."),
    QuickActionItem(key="alis_hareketleri", label="Alış Hareketleri", href="/purchases", color="#198754", description="Alış hareketlerini yönetin.", fixed=True),
    QuickActionItem(key="tedarik_merkezi", label="Tedarik Merkezi", href="/suppliers", color="#0f766e", description="Tedarikçi ve satın alma işlemlerine ulaşın."),
    QuickActionItem(key="satis_belgeleri", label="Satışlar", href="/sales", color="#0f766e", description="Direkt satış belgelerini görüntüleyin."),
    QuickActionItem(key="perakende_satislar", label="Perakende Satışlar", href="/sales/retail", color="#f97316", description="Perakende satış listesi."),
    QuickActionItem(key="gider_takibi", label="Gider Takibi", href="/finance/expenses", color="#be123c", description="Masraf kayıtlarını ve ödemeleri takip edin."),
    QuickActionItem(key="acik_bakiyeler", label="Açık Bakiyeler", href="/customers/receivables", color="#be123c", description="Açık cari alacaklar."),
    QuickActionItem(key="hesaplarim", label="Hesaplarım", href="/finance/banks", color="#334155", description="Banka hesapları."),
    QuickActionItem(key="krediler", label="Krediler", href="/finance/loans", color="#7c3aed", description="Kredi ödemeleri."),
    QuickActionItem(key="urun_stok_merkezi", label="Ürün & Stok Merkezi", href="/products", color="#06b6d4", description="Ürün, varyant ve stok durumunu yönetin."),
    QuickActionItem(key="fiyat_listesi", label="Fiyat Listesi", href="/price-lists", color="#be123c", description="Fiyat listeleri."),
    QuickActionItem(key="dtf_maliyet", label="DTF Maliyet", href="/tools/dtf", color="#0891b2", description="DTF maliyet hesaplama."),
    QuickActionItem(key="maliyet_yonetimi", label="Maliyet Yönetimi", href="/tools/costs", color="#7c3aed", description="Maliyet kalemleri."),
    QuickActionItem(key="internet_raporu", label="İnternet Raporu", href="/ecommerce", color="#f97316", description="İnternet satışları."),
    QuickActionItem(key="gorevler", label="Görevler", href="/crm", color="#2563eb", description="CRM / görevler."),
    QuickActionItem(key="evrak_dolabi", label="Evrak Dolabı", href="/documents", color="#0f766e", description="Belgelerinize merkezi alandan erişin."),
    QuickActionItem(key="yedekleme", label="Yedekleme", href="/settings/backups", color="#16a34a", description="Yedekleme paneli."),
    QuickActionItem(key="ayarlar", label="Ayarlar", href="/settings", color="#6f42c1", description="Sistem ayarları."),
]

FIXED_QUICK = {"alis_hareketleri"}


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_active=u.is_active,
        roles=[r.name for r in u.roles],
    )


def _settings_map(db: Session) -> dict[str, str]:
    return {s.key: s.value for s in db.query(AppSetting).all()}


def _upsert_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def _parse_json(raw: str | None, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _out(m: dict[str, str]) -> AppSettingsOut:
    hizli = _parse_json(m.get("hizli_islemler"), list(DEFAULT_HIZLI))
    if not isinstance(hizli, list) or not hizli:
        hizli = list(DEFAULT_HIZLI)
    # ensure fixed keys
    for k in FIXED_QUICK:
        if k not in hizli:
            hizli.append(k)
    sol_sira = _parse_json(m.get("sol_menu_sirasi"), list(DEFAULT_SOL_MENU))
    if not isinstance(sol_sira, list) or not sol_sira:
        sol_sira = list(DEFAULT_SOL_MENU)
    sol_adlar = _parse_json(m.get("sol_menu_adlari"), {})
    if not isinstance(sol_adlar, dict):
        sol_adlar = {}
    return AppSettingsOut(
        company_name=m.get("company_name", "Baykuş Baskı"),
        phone=m.get("phone", ""),
        whatsapp=m.get("whatsapp", ""),
        web_adresi=m.get("web_adresi", ""),
        pdf_alt_baslik=m.get("pdf_alt_baslik", ""),
        logo_dosyasi=m.get("logo_dosyasi", ""),
        form_logo_dosyasi=m.get("form_logo_dosyasi", ""),
        theme_label=m.get("theme_label", "Varsayılan"),
        require_login=m.get("require_login", "Evet"),
        user_mode=m.get("user_mode", "Yönetici"),
        veri_motoru=m.get("veri_motoru", "SQLite"),
        postgres_host=m.get("postgres_host", ""),
        postgres_port=m.get("postgres_port", "5432"),
        postgres_db=m.get("postgres_db", "baykus"),
        postgres_user=m.get("postgres_user", ""),
        postgres_ssl=m.get("postgres_ssl", "Hayır"),
        merkezi_db_turu=m.get("merkezi_db_turu", "PostgreSQL"),
        sunucu_lokasyon=m.get("sunucu_lokasyon", ""),
        hizli_islemler=hizli,
        sol_menu_sirasi=sol_sira,
        sol_menu_adlari={str(k): str(v) for k, v in sol_adlar.items()},
        teklif_sablon_adi=m.get("teklif_sablon_adi", "Teklif Formu"),
        teklif_sablon_baslik=m.get("teklif_sablon_baslik", "Teklif Formu"),
        teklif_sablon_alt_baslik=m.get(
            "teklif_sablon_alt_baslik", "Kişiye ve Kuruma Özel Baskı Hizmetleri"
        ),
        teklif_sablon_logo_goster=m.get("teklif_sablon_logo_goster", "Evet"),
        teklif_sablon_musteri_goster=m.get("teklif_sablon_musteri_goster", "Evet"),
        teklif_sablon_urun_detay_goster=m.get("teklif_sablon_urun_detay_goster", "Evet"),
        teklif_sablon_toplam_goster=m.get("teklif_sablon_toplam_goster", "Evet"),
        teklif_sablon_not_goster=m.get("teklif_sablon_not_goster", "Evet"),
        teklif_sablon_sartlar_goster=m.get("teklif_sablon_sartlar_goster", "Evet"),
        teklif_sablon_sartlar=m.get("teklif_sablon_sartlar", DEFAULT_TEKLIF_SARTLAR),
        teklif_sablon_kapanis=m.get("teklif_sablon_kapanis", DEFAULT_TEKLIF_KAPANIS),
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> list[UserOut]:
    return [_user_out(u) for u in db.query(User).order_by(User.id).all()]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> UserOut:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="E-posta zaten kayıtlı")
    roles = db.query(Role).filter(Role.name.in_(payload.roles or [])).all()
    if payload.roles and len(roles) != len(set(payload.roles)):
        raise HTTPException(status_code=400, detail="Geçersiz rol")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_active=payload.is_active,
    )
    user.roles = list(roles)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    roles = data.pop("roles", None)
    for k, v in data.items():
        setattr(user, k, v)
    if roles is not None:
        role_rows = db.query(Role).filter(Role.name.in_(roles)).all()
        if len(role_rows) != len(set(roles)):
            raise HTTPException(status_code=400, detail="Geçersiz rol")
        user.roles = list(role_rows)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    user_id: int,
    payload: PasswordChange,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    roles = db.query(Role).order_by(Role.id).all()
    return {"roles": [{"id": r.id, "name": r.name, "description": r.description} for r in roles]}


@router.get("/app", response_model=AppSettingsOut)
def get_app_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> AppSettingsOut:
    return _out(_settings_map(db))


@router.put("/app", response_model=AppSettingsOut)
def update_app_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> AppSettingsOut:
    data = payload.model_dump(exclude_unset=True)
    # Never accept secrets via this endpoint
    for banned in (
        "bizimhesap_key", "bizimhesap_token", "postgres_password",
        "yedek_sifre_dpapi", "gecmis_silme_sifresi", "api_key",
    ):
        data.pop(banned, None)

    for key, value in data.items():
        if key in JSON_KEYS and value is not None:
            if key == "hizli_islemler" and isinstance(value, list):
                cleaned = []
                for item in value:
                    s = str(item).strip()
                    if s and s not in cleaned:
                        cleaned.append(s)
                for fk in FIXED_QUICK:
                    if fk not in cleaned:
                        cleaned.append(fk)
                _upsert_setting(db, key, json.dumps(cleaned, ensure_ascii=False))
            elif key == "sol_menu_sirasi" and isinstance(value, list):
                cleaned = [str(x).strip() for x in value if str(x).strip()]
                _upsert_setting(db, key, json.dumps(cleaned, ensure_ascii=False))
            elif key == "sol_menu_adlari" and isinstance(value, dict):
                cleaned = {str(k): str(v)[:40] for k, v in value.items() if str(v).strip()}
                _upsert_setting(db, key, json.dumps(cleaned, ensure_ascii=False))
        elif key in SETTING_KEYS and value is not None:
            _upsert_setting(db, key, str(value))
    db.commit()
    return _out(_settings_map(db))


@router.get("/quick-actions", response_model=list[QuickActionItem])
def list_quick_actions(
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> list[QuickActionItem]:
    return QUICK_CATALOG


# --- Varyant Yönetimi (katalog) ---

@router.get("/variants", response_model=list[VariantOptionOut])
def list_variant_options(
    kind: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> list[VariantOptionOut]:
    q = db.query(VariantOption).order_by(VariantOption.kind, VariantOption.value)
    if kind:
        q = q.filter(VariantOption.kind.ilike(kind.strip()))
    return [VariantOptionOut.model_validate(r) for r in q.all()]


@router.post("/variants", response_model=VariantOptionOut, status_code=status.HTTP_201_CREATED)
def create_variant_option(
    payload: VariantOptionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> VariantOptionOut:
    kind = payload.kind.strip()
    value = payload.value.strip()
    existing = (
        db.query(VariantOption)
        .filter(
            VariantOption.kind.ilike(kind),
            VariantOption.value.ilike(value),
        )
        .first()
    )
    if existing:
        existing.kind = kind
        existing.value = value
        existing.note = (payload.note or "").strip() or None
        db.commit()
        db.refresh(existing)
        return VariantOptionOut.model_validate(existing)
    row = VariantOption(kind=kind, value=value, note=(payload.note or "").strip() or None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return VariantOptionOut.model_validate(row)


@router.put("/variants/{option_id}", response_model=VariantOptionOut)
def update_variant_option(
    option_id: int,
    payload: VariantOptionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> VariantOptionOut:
    row = db.get(VariantOption, option_id)
    if not row:
        raise HTTPException(status_code=404, detail="Varyant bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "kind" in data and data["kind"]:
        data["kind"] = data["kind"].strip()
    if "value" in data and data["value"]:
        data["value"] = data["value"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return VariantOptionOut.model_validate(row)


@router.delete("/variants/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant_option(
    option_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> None:
    row = db.get(VariantOption, option_id)
    if not row:
        raise HTTPException(status_code=404, detail="Varyant bulunamadı")
    db.delete(row)
    db.commit()


@router.post("/variants/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_variants(
    ids: list[int],
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "üretim")),
) -> None:
    if not ids:
        return
    db.query(VariantOption).filter(VariantOption.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
