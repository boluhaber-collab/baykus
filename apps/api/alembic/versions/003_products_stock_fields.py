"""products: brand/type/prices/critical; variants print/barcode; stock_movements

Revision ID: 003
Revises: 002
Create Date: 2026-09-20 13:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("brand", sa.String(100)))
    op.add_column("products", sa.Column("supplier_name", sa.String(255)))
    op.add_column(
        "products",
        sa.Column("product_type", sa.String(20), server_default="stoklu"),
    )
    op.add_column(
        "products",
        sa.Column("purchase_price", sa.Numeric(12, 2), server_default="0"),
    )
    op.add_column(
        "products",
        sa.Column("cost", sa.Numeric(12, 2), server_default="0"),
    )
    op.add_column("products", sa.Column("photo_url", sa.String(500)))
    op.add_column(
        "products",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
    )
    op.add_column(
        "products",
        sa.Column("critical_stock_threshold", sa.Integer(), server_default="10"),
    )
    op.add_column(
        "products",
        sa.Column("warehouse", sa.String(100), server_default="Ana Depo"),
    )
    op.add_column(
        "products",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.add_column("product_variants", sa.Column("print_type", sa.String(100)))
    op.add_column("product_variants", sa.Column("barcode", sa.String(64)))
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("qty_before", sa.Integer(), server_default="0"),
        sa.Column("qty_after", sa.Integer(), server_default="0"),
        sa.Column("reason", sa.String(255)),
        sa.Column("note", sa.Text()),
        sa.Column("warehouse", sa.String(100)),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_stock_movements_product_id", "stock_movements", ["product_id"])
    op.create_index("ix_stock_movements_variant_id", "stock_movements", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_movements_variant_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_product_id", table_name="stock_movements")
    op.drop_table("stock_movements")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_column("product_variants", "barcode")
    op.drop_column("product_variants", "print_type")
    op.drop_column("products", "updated_at")
    op.drop_column("products", "warehouse")
    op.drop_column("products", "critical_stock_threshold")
    op.drop_column("products", "is_active")
    op.drop_column("products", "photo_url")
    op.drop_column("products", "cost")
    op.drop_column("products", "purchase_price")
    op.drop_column("products", "product_type")
    op.drop_column("products", "supplier_name")
    op.drop_column("products", "brand")
