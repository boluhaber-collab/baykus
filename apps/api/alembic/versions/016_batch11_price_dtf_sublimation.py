"""batch 11: price list item fields, sublimation duration_text

Revision ID: 016
Revises: 015
Create Date: 2026-09-20 19:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("price_list_items", sa.Column("supplier_name", sa.String(255), nullable=True))
    op.add_column("price_list_items", sa.Column("purchase_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("price_list_items", sa.Column("blank_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("price_list_items", sa.Column("printed_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("price_list_items", sa.Column("embroidered_price", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "sublimation_print_times",
        sa.Column("duration_text", sa.String(120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sublimation_print_times", "duration_text")
    op.drop_column("price_list_items", "embroidered_price")
    op.drop_column("price_list_items", "printed_price")
    op.drop_column("price_list_items", "blank_price")
    op.drop_column("price_list_items", "purchase_price")
    op.drop_column("price_list_items", "supplier_name")
