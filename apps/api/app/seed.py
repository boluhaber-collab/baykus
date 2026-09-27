"""Seed roles, users, and minimal app defaults — no demo commercial data.

Demo SIP/TKL/M-00x/T-00x catalog was removed. Real data comes from BizimHesap
import scripts (see docs/BIZIMHESAP_IMPORT.md). To purge leftover seed rows:

  python -m app.scripts.wipe_demo_data
"""

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    AppSetting,
    Role,
    User,
    Warehouse,
    WhatsAppTemplate,
)


ROLES = [
    ("admin", "Tam yetki"),
    ("satış", "Satış ve müşteri yönetimi"),
    ("üretim", "Üretim ve stok"),
    ("muhasebe", "Finans ve raporlar"),
]


def seed(db: Session) -> None:
    """Idempotent essentials only (roles, users, settings, WA templates, depots)."""
    if db.query(Role).count() == 0:
        roles = [Role(name=n, description=d) for n, d in ROLES]
        db.add_all(roles)
        db.commit()

    role_map = {r.name: r for r in db.query(Role).all()}

    def ensure_user(email: str, name: str, password: str, role_names: list[str]) -> None:
        user = db.query(User).filter(User.email == email).first()
        if user:
            return
        user = User(
            email=email,
            full_name=name,
            hashed_password=hash_password(password),
            is_active=True,
        )
        user.roles = [role_map[r] for r in role_names if r in role_map]
        db.add(user)

    ensure_user("admin@baykus.local", "Sistem Yöneticisi", "admin123", ["admin"])
    ensure_user("satis@baykus.local", "Ayşe Satış", "satis123", ["satış"])
    ensure_user("uretim@baykus.local", "Mehmet Üretim", "uretim123", ["üretim"])
    ensure_user("muhasebe@baykus.local", "Zeynep Muhasebe", "muhasebe123", ["muhasebe"])
    db.commit()

    if db.query(AppSetting).count() == 0:
        db.add_all(
            [
                AppSetting(key="company_name", value="Baykuş Baskı"),
                AppSetting(key="phone", value="+90 212 555 0101"),
                AppSetting(key="theme_label", value="Açık"),
            ]
        )
        db.commit()

    if db.query(WhatsAppTemplate).count() == 0:
        db.add_all(
            [
                WhatsAppTemplate(
                    name="siparis_hazir",
                    category="hazır sipariş",
                    body="Merhaba {ad}, {siparis_no} numaralı siparişiniz hazır. Toplam: {tutar} TL. Teslim tarihi: {tarih}.",
                ),
                WhatsAppTemplate(
                    name="odeme_hatirlatma",
                    category="ödeme hatırlatma",
                    body="Sayın {ad}, {siparis_no} için {tutar} TL bakiyeniz bulunmaktadır. Son ödeme: {tarih}.",
                ),
                WhatsAppTemplate(
                    name="tasarim_onayi",
                    category="tasarım onayı",
                    body="Merhaba {ad}, {siparis_no} tasarımı onayınızı bekliyor. Lütfen {tarih} öncesi dönüş yapın.",
                ),
                WhatsAppTemplate(
                    name="tasarim_revizyon",
                    category="tasarım onayı",
                    body="Merhaba {ad}, {siparis_no} için revizyon notumuz: {not}. Güncellenmiş tasarımı onayınıza sunuyoruz.",
                ),
                WhatsAppTemplate(
                    name="teslimat_bildirim",
                    category="teslimat",
                    body="Merhaba {ad}, {siparis_no} siparişiniz {tarih} tarihinde teslim edilecektir. Tutar: {tutar} TL.",
                ),
                WhatsAppTemplate(
                    name="kampanya_duyuru",
                    category="kampanya",
                    body="Merhaba {ad}! {tarih} tarihine kadar baskı işlerinde özel fırsat. Detay için yazın.",
                ),
            ]
        )
        db.commit()

    if db.query(Warehouse).count() == 0:
        db.add_all(
            [
                Warehouse(
                    name="Ana Depo",
                    code="ANA",
                    is_default=True,
                    is_active=True,
                    address="Atölye — zemin kat",
                ),
            ]
        )
        db.commit()

    print("Seed tamamlandı (essentials): admin@baykus.local / admin123 — demo veri yok")


def main() -> None:
    """Seed essentials only. For SQLite first-time setup prefer: python -m app.bootstrap_sqlite

    Postgres: alembic upgrade head && python -m app.seed
    SQLite:   python -m app.bootstrap_sqlite   (create_all + essentials; skip alembic)
    """
    from app.core.config import get_settings

    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        from sqlalchemy import inspect

        import app.models  # noqa: F401
        from app.db.base import Base
        from app.db.session import engine

        if "users" not in set(inspect(engine).get_table_names()):
            print("SQLite tabloları yok — create_all...")
            Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
