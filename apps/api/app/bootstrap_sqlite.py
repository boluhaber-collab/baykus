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
    finally:
        db.close()


def main() -> None:
    bootstrap()


if __name__ == "__main__":
    main()
