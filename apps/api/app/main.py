from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    assets,
    costs,
    directory,
    documents,
    audit,
    auth,
    backups,
    crm,
    customers,
    dashboard,
    dtf,
    expenses,
    finance,
    integrations,
    loans,
    orders,
    price_lists,
    products,
    warehouses,
    purchases,
    quotes,
    reports,
    settings as settings_router,
    suppliers,
    whatsapp,
    sublimation,
)
from app.core.config import get_settings

cfg = get_settings()

app = FastAPI(title=cfg.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    dashboard.router,
    customers.router,
    products.router,
    warehouses.router,
    directory.router,
    documents.router,
    costs.router,
    quotes.router,
    orders.router,
    suppliers.router,
    purchases.router,
    expenses.router,
    finance.router,
    loans.router,
    assets.router,
    dtf.router,
    crm.router,
    price_lists.router,
    reports.router,
    settings_router.router,
    whatsapp.router,
    audit.router,
    backups.router,
    integrations.router,
    sublimation.router,
):
    app.include_router(router, prefix="/api")

@app.get("/health")
def health() -> dict:
    """Sistem Sağlık Merkezi — public probe (no secrets)."""
    from sqlalchemy import inspect, text
    from app.db.session import engine
    from app.core.config import get_settings

    settings = get_settings()
    db_url = settings.database_url or ""
    engine_name = "sqlite" if db_url.lower().startswith("sqlite") else "postgres"
    tables: list[dict] = []
    table_count = 0
    db_ok = False
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
        insp = inspect(engine)
        names = sorted(insp.get_table_names())
        table_count = len(names)
        # sample row counts for a few core tables (no PII dump)
        for name in names[:40]:
            if not name.replace("_", "").isalnum():
                continue
            try:
                with engine.connect() as conn:
                    n = conn.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar()
                tables.append({"table": name, "rows": int(n or 0)})
            except Exception:
                tables.append({"table": name, "rows": None})
    except Exception as exc:  # noqa: BLE001
        db_error = str(exc)[:200]

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "baykus-api",
        "database": {
            "ok": db_ok,
            "engine": engine_name,
            "table_count": table_count,
            "error": db_error,
        },
        "sqlite_tables": tables if engine_name == "sqlite" else [],
        "checks": [
            {"name": "API", "status": "Tamam", "detail": "Uvicorn yanıt veriyor"},
            {
                "name": "Veritabanı",
                "status": "Tamam" if db_ok else "Hata",
                "detail": engine_name if db_ok else (db_error or "bağlantı yok"),
            },
            {
                "name": "Tablo sayısı",
                "status": "Tamam" if table_count else "Uyarı",
                "detail": str(table_count),
            },
        ],
    }

