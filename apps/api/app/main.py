from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    expenses,
    audit,
    auth,
    customers,
    dashboard,
    finance,
    loans,
    orders,
    price_lists,
    products,
    quotes,
    reports,
    settings as settings_router,
    purchases,
    suppliers,
    whatsapp,
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
    quotes.router,
    orders.router,
    suppliers.router,
    purchases.router,
    expenses.router,
    finance.router,
    loans.router,
    price_lists.router,
    reports.router,
    settings_router.router,
    whatsapp.router,
    audit.router,
):
    app.include_router(router, prefix="/api")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": cfg.app_name}
