"""Hot lookup indexes (products, variants, movements, stock, party names).

Revision ID: 019
Revises: 018
Create Date: 2026-10-03 18:00:00.000000

Idempotent: skips indexes whose leading columns are already covered.
SQLite installs get the same set from app.db.indexes.ensure_hot_indexes.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

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


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    known: dict[str, list[dict]] = {}
    for name, table, columns in HOT_INDEXES:
        if table not in tables:
            continue
        if table not in known:
            known[table] = list(insp.get_indexes(table))
        if _covered(known[table], columns):
            continue
        op.create_index(name, table, list(columns))
        known[table].append({"name": name, "column_names": list(columns)})


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    for name, table, _columns in reversed(HOT_INDEXES):
        if table not in tables:
            continue
        existing = {idx["name"] for idx in insp.get_indexes(table)}
        if name in existing:
            op.drop_index(name, table_name=table)
