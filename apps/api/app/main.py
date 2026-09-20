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
    return {"status": "ok", "app": cfg.app_name}
