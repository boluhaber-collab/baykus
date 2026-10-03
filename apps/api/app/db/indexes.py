"""Idempotent indexes for hot lookups.

SQLite create_all does not add indexes to tables that already exist, and
Postgres installs may lag Alembic. Both startup and bootstrap call
ensure_hot_indexes(); creation is skipped when an index already covers the
same leading columns.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.db.session import engine

# (index name, table, columns)
HOT_INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_products_sku", "products", ("sku",)),
    ("ix_products_name", "products", ("name",)),
    ("ix_product_variants_sku", "product_variants", ("sku",)),
    ("ix_product_variants_color", "product_variants", ("color",)),
    ("ix_product_variants_size", "product_variants", ("size",)),
    ("ix_product_variants_product_id", "product_variants", ("product_id",)),
    ("ix_cari_movements_customer_id", "cari_movements", ("customer_id",)),
    ("ix_cari_movements_customer_date", "cari_movements", ("customer_id", "movement_date")),
    ("ix_cash_movements_register_date", "cash_movements", ("cash_register_id", "movement_date")),
    ("ix_bank_movements_account_date", "bank_movements", ("bank_account_id", "movement_date")),
    ("ix_stock_movements_product_id", "stock_movements", ("product_id",)),
    ("ix_stock_movements_product_created", "stock_movements", ("product_id", "created_at")),
    ("ix_warehouse_stocks_product_id", "warehouse_stocks", ("product_id",)),
    ("ix_warehouse_stocks_variant_id", "warehouse_stocks", ("variant_id",)),
    ("ix_warehouse_stocks_product_wh", "warehouse_stocks", ("product_id", "warehouse")),
    ("ix_customers_name", "customers", ("name",)),
    ("ix_suppliers_name", "suppliers", ("name",)),
)


def _covered(existing: list[dict], columns: tuple[str, ...]) -> bool:
    want = [c.lower() for c in columns]
    for idx in existing:
        cols = [str(c).lower() for c in (idx.get("column_names") or []) if c]
        if cols[: len(want)] == want:
            return True
    return False


def ensure_hot_indexes(bind: Engine | None = None) -> list[str]:
    """Create missing lookup indexes. Returns names that were created."""
    target = bind or engine
    insp = inspect(target)
    tables = set(insp.get_table_names())
    known: dict[str, list[dict]] = {}
    created: list[str] = []
    with target.begin() as conn:
        for name, table, columns in HOT_INDEXES:
            if table not in tables:
                continue
            if table not in known:
                known[table] = list(insp.get_indexes(table))
            if _covered(known[table], columns):
                continue
            cols_sql = ", ".join(columns)
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS "{name}" ON "{table}" ({cols_sql})'))
            created.append(name)
            known[table].append({"name": name, "column_names": list(columns)})
    return created
