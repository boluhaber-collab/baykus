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
    search,
    settings as settings_router,
    suppliers,
    whatsapp,
    sublimation,
    tasks,
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
    search.router,
    settings_router.router,
    whatsapp.router,
    audit.router,
    backups.router,
    integrations.router,
    sublimation.router,
    tasks.router,
):
    app.include_router(router, prefix="/api")

@app.get("/health")
def health() -> dict:
    """Sistem / Veri Sağlık Merkezi — public probe (no secrets)."""
    from sqlalchemy import inspect, text
    from app.db.session import SessionLocal, engine
    from app.core.config import get_settings

    settings = get_settings()
    db_url = settings.database_url or ""
    engine_name = "sqlite" if db_url.lower().startswith("sqlite") else "postgres"
    tables: list[dict] = []
    table_count = 0
    db_ok = False
    db_error = None
    counts: dict[str, int] = {}
    orphans: list[dict] = []
    issues: list[dict] = []

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
        insp = inspect(engine)
        names = sorted(insp.get_table_names())
        table_count = len(names)
        for name in names[:60]:
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

    # Entity counts + orphan checks (read-only)
    if db_ok:
        try:
            from app.models.customer import Customer, CariMovement
            from app.models.order import Order, OrderLine, Payment
            from app.models.product import Product, StockMovement
            from app.models.supplier import Supplier, Purchase, PurchaseLine
            from app.models.quote import Quote
            from app.models.expense import Expense, ExpenseCategory
            from app.models.finance import CashRegister, BankAccount, CashMovement, BankMovement
            from app.models.task import Task

            db = SessionLocal()
            try:
                def cnt(model):
                    try:
                        return int(db.query(model).count())
                    except Exception:
                        return 0

                counts = {
                    "customers": cnt(Customer),
                    "orders": cnt(Order),
                    "products": cnt(Product),
                    "suppliers": cnt(Supplier),
                    "quotes": cnt(Quote),
                    "expenses": cnt(Expense),
                    "expense_categories": cnt(ExpenseCategory),
                    "cash_registers": cnt(CashRegister),
                    "bank_accounts": cnt(BankAccount),
                    "tasks": cnt(Task),
                    "cari_movements": cnt(CariMovement),
                    "stock_movements": cnt(StockMovement),
                }

                # Orphan: order lines without product (product deleted)
                try:
                    n = (
                        db.query(OrderLine)
                        .filter(OrderLine.product_id.isnot(None))
                        .outerjoin(Product, Product.id == OrderLine.product_id)
                        .filter(Product.id.is_(None))
                        .count()
                    )
                    if n:
                        orphans.append(
                            {
                                "Kategori": "Sipariş",
                                "Önem": "Orta",
                                "Kayıt": f"{n} satır",
                                "Detay": "Sipariş satırında ürün kaydı bulunamadı (orphaned product_id).",
                                "Hedef": "Sipariş Listesi",
                            }
                        )
                except Exception:
                    pass

                try:
                    n = (
                        db.query(Payment)
                        .outerjoin(Order, Order.id == Payment.order_id)
                        .filter(Order.id.is_(None))
                        .count()
                    )
                    if n:
                        orphans.append(
                            {
                                "Kategori": "Sipariş",
                                "Önem": "Yüksek",
                                "Kayıt": f"{n} ödeme",
                                "Detay": "Ödeme kaydı siparişe bağlı değil.",
                                "Hedef": "Sipariş Listesi",
                            }
                        )
                except Exception:
                    pass

                try:
                    n = (
                        db.query(CariMovement)
                        .outerjoin(Customer, Customer.id == CariMovement.customer_id)
                        .filter(Customer.id.is_(None))
                        .count()
                    )
                    if n:
                        orphans.append(
                            {
                                "Kategori": "Müşteri",
                                "Önem": "Yüksek",
                                "Kayıt": f"{n} cari hareket",
                                "Detay": "Cari hareket müşteriye bağlı değil.",
                                "Hedef": "Müşteri Merkezi",
                            }
                        )
                except Exception:
                    pass

                try:
                    n = (
                        db.query(PurchaseLine)
                        .filter(PurchaseLine.product_id.isnot(None))
                        .outerjoin(Product, Product.id == PurchaseLine.product_id)
                        .filter(Product.id.is_(None))
                        .count()
                    )
                    if n:
                        orphans.append(
                            {
                                "Kategori": "Tedarik",
                                "Önem": "Orta",
                                "Kayıt": f"{n} alış satırı",
                                "Detay": "Alış satırında ürün kaydı yok.",
                                "Hedef": "Tedarikçi Kartları",
                            }
                        )
                except Exception:
                    pass

                # Data health checklist items
                try:
                    no_phone = (
                        db.query(Customer)
                        .filter(
                            Customer.is_active.is_(True),
                            (Customer.phone.is_(None)) | (Customer.phone == ""),
                        )
                        .count()
                    )
                    if no_phone:
                        issues.append(
                            {
                                "Kategori": "Müşteri",
                                "Önem": "Orta",
                                "Kayıt": f"{no_phone} müşteri",
                                "Detay": "Telefon numarası eksik.",
                                "Hedef": "Müşteri Merkezi",
                            }
                        )
                except Exception:
                    pass

                try:
                    crit = (
                        db.query(Product)
                        .filter(
                            Product.is_active.is_(True),
                            Product.stock_qty < Product.critical_stock_threshold,
                        )
                        .count()
                    )
                    if crit:
                        issues.append(
                            {
                                "Kategori": "Stok",
                                "Önem": "Orta",
                                "Kayıt": f"{crit} ürün",
                                "Detay": "Kritik stok eşiğinin altında.",
                                "Hedef": "Kritik Stok",
                            }
                        )
                except Exception:
                    pass

                try:
                    if counts.get("cash_registers", 0) == 0:
                        issues.append(
                            {
                                "Kategori": "Finans",
                                "Önem": "Yüksek",
                                "Kayıt": "Kasa",
                                "Detay": "Aktif kasa tanımı yok.",
                                "Hedef": "Hesaplarım",
                            }
                        )
                except Exception:
                    pass

            finally:
                db.close()
        except Exception as exc:  # noqa: BLE001
            issues.append(
                {
                    "Kategori": "Sistem",
                    "Önem": "Yüksek",
                    "Kayıt": "Sağlık taraması",
                    "Detay": str(exc)[:180],
                    "Hedef": "SQLite Kontrol",
                }
            )

    checks = [
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
        {
            "name": "Kayıt özeti",
            "status": "Tamam" if counts else "Uyarı",
            "detail": ", ".join(f"{k}={v}" for k, v in list(counts.items())[:6]) or "—",
        },
        {
            "name": "Yetim kayıt",
            "status": "Tamam" if not orphans else "Uyarı",
            "detail": f"{len(orphans)} sorun" if orphans else "Yok",
        },
        {
            "name": "Veri sağlık",
            "status": "Tamam" if not issues else "Uyarı",
            "detail": f"{len(issues)} uyarı" if issues else "Temiz",
        },
    ]

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "baykus-api",
        "database": {
            "ok": db_ok,
            "engine": engine_name,
            "table_count": table_count,
            "error": db_error,
        },
        "sqlite_tables": tables if engine_name == "sqlite" else tables,
        "counts": counts,
        "orphans": orphans,
        "data_issues": issues,
        "checks": checks,
    }
