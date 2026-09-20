"""warehouse_stocks + variant_options

Revision ID: 013
Revises: 012
Create Date: 2026-09-20 17:45:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "warehouse_stocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("variant_key", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warehouse", sa.String(100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("product_id", "variant_key", "warehouse", name="uq_warehouse_stock_product_variant_wh"),
    )
    op.create_index("ix_warehouse_stocks_product_id", "warehouse_stocks", ["product_id"])
    op.create_index("ix_warehouse_stocks_variant_id", "warehouse_stocks", ["variant_id"])
    op.create_index("ix_warehouse_stocks_warehouse", "warehouse_stocks", ["warehouse"])

    op.create_table(
        "variant_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(80), nullable=False),
        sa.Column("value", sa.String(120), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("kind", "value", name="uq_variant_option_kind_value"),
    )
    op.create_index("ix_variant_options_kind", "variant_options", ["kind"])


def downgrade() -> None:
    op.drop_table("variant_options")
    op.drop_table("warehouse_stocks")
