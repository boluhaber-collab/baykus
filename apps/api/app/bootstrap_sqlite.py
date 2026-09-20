"""SQLite bootstrap: create_all + seed when tables are missing.

Windows / Docker-suz yerel geliştirme:
  cd apps/api
  .\\.venv\\Scripts\\Activate.ps1
  $env:DATABASE_URL = "sqlite:///./baykus.db"
  python -m app.bootstrap_sqlite

Postgres (Docker veya yerel):
  alembic upgrade head
  python -m app.seed

SQLite için Alembic kullanmayın — şema create_all ile oluşturulur.
Postgres için Alembic migration yolunu koruyun.
"""

from __future__ import annotations

from sqlalchemy import inspect

# Ensure all models register on Base.metadata
import app.models  # noqa: F401
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.seed import seed


def is_sqlite(url: str | None = None) -> bool:
    u = (url or get_settings().database_url).lower()
    return u.startswith("sqlite")


def tables_missing() -> bool:
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    # Core table used as readiness signal
    return "users" not in existing


def bootstrap() -> None:
    settings = get_settings()
    if not is_sqlite(settings.database_url):
        print(
            "DATABASE_URL SQLite değil — create_all atlandı.\n"
            "Postgres için: alembic upgrade head && python -m app.seed"
        )
        return

    # create_all is additive — creates any missing tables (price_lists, loans, audit, …)
    print("SQLite — Base.metadata.create_all (eksik tablolar eklenir)...")
    Base.metadata.create_all(bind=engine)

    # SQLite cannot ADD via create_all for existing tables — patch critical columns
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        if "documents" in insp.get_table_names():
            dcols = {c["name"] for c in insp.get_columns("documents")}
            if "archive_tag" not in dcols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN archive_tag VARCHAR(100)"))
                print("  + documents.archive_tag")
        if "orders" in insp.get_table_names():
            ocols = {c["name"] for c in insp.get_columns("orders")}
            if "design_approved_at" not in ocols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN design_approved_at DATETIME"))
                print("  + orders.design_approved_at")
            if "design_whatsapp_at" not in ocols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN design_whatsapp_at DATETIME"))
                print("  + orders.design_whatsapp_at")
        if "bank_accounts" in insp.get_table_names():
            bcols = {c["name"] for c in insp.get_columns("bank_accounts")}
            if "account_type" not in bcols:
                conn.execute(text("ALTER TABLE bank_accounts ADD COLUMN account_type VARCHAR(40) DEFAULT 'Banka'"))
                print("  + bank_accounts.account_type")
            if "institution" not in bcols:
                conn.execute(text("ALTER TABLE bank_accounts ADD COLUMN institution VARCHAR(150)"))
                print("  + bank_accounts.institution")
        if "expenses" in insp.get_table_names():
            ecols = {c["name"] for c in insp.get_columns("expenses")}
            if "due_date" not in ecols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN due_date DATE"))
                print("  + expenses.due_date")
            if "document_no" not in ecols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN document_no VARCHAR(50)"))
                print("  + expenses.document_no")
        if "assets" in insp.get_table_names():
            acols = {c["name"] for c in insp.get_columns("assets")}
            if "serial_no" not in acols:
                conn.execute(text("ALTER TABLE assets ADD COLUMN serial_no VARCHAR(100)"))
                print("  + assets.serial_no")
            if "current_value" not in acols:
                conn.execute(text("ALTER TABLE assets ADD COLUMN current_value NUMERIC(12,2)"))
                print("  + assets.current_value")
            if "status" not in acols:
                conn.execute(text("ALTER TABLE assets ADD COLUMN status VARCHAR(40) DEFAULT 'Aktif'"))
                print("  + assets.status")
            if "maintenance_date" not in acols:
                conn.execute(text("ALTER TABLE assets ADD COLUMN maintenance_date DATE"))
                print("  + assets.maintenance_date")
        if "price_list_items" in insp.get_table_names():
            pcols = {c["name"] for c in insp.get_columns("price_list_items")}
            for col, sql in (
                ("supplier_name", "ALTER TABLE price_list_items ADD COLUMN supplier_name VARCHAR(255)"),
                ("purchase_price", "ALTER TABLE price_list_items ADD COLUMN purchase_price NUMERIC(12,2)"),
                ("blank_price", "ALTER TABLE price_list_items ADD COLUMN blank_price NUMERIC(12,2)"),
                ("printed_price", "ALTER TABLE price_list_items ADD COLUMN printed_price NUMERIC(12,2)"),
                ("embroidered_price", "ALTER TABLE price_list_items ADD COLUMN embroidered_price NUMERIC(12,2)"),
            ):
                if col not in pcols:
                    conn.execute(text(sql))
                    print(f"  + price_list_items.{col}")
        if "sublimation_print_times" in insp.get_table_names():
            scols = {c["name"] for c in insp.get_columns("sublimation_print_times")}
            if "duration_text" not in scols:
                conn.execute(text("ALTER TABLE sublimation_print_times ADD COLUMN duration_text VARCHAR(120)"))
                print("  + sublimation_print_times.duration_text")
            # Remap legacy design_status labels
            for old_v, new_v in (
                ("bekliyor", "Bekliyor"),
                ("onaylandı", "Onaylandı"),
                ("onaylandi", "Onaylandı"),
                ("revizyon", "Revizyon İstendi"),
            ):
                conn.execute(
                    text("UPDATE orders SET design_status = :n WHERE lower(design_status) = :o"),
                    {"n": new_v, "o": old_v},
                )
    if tables_missing():
        print("Uyarı: users tablosu hâlâ yok.")
    else:
        print("Tablolar hazır.")

    db = SessionLocal()
    try:
        seed(db)
        # Ensure default depots (desktop Ana Depo / BOLU BAYİ)
        from app.models.warehouse import Warehouse
        for name, is_def in (("Ana Depo", True), ("BOLU BAYİ", False)):
            if not db.query(Warehouse).filter(Warehouse.name == name).first():
                db.add(Warehouse(name=name, is_active=True, is_default=is_def, notes="Varsayılan"))
        db.commit()
        print("Varsayılan depolar kontrol edildi.")
    finally:
        db.close()


def main() -> None:
    bootstrap()


if __name__ == "__main__":
    main()
