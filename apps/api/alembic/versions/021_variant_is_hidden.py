"""product_variants.is_hidden — hareketli varyant silinmez, gizlenir

Revision ID: 021
Revises: 020
Create Date: 2026-11-01 20:45:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("is_hidden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_index("ix_product_variants_is_hidden", "product_variants", ["is_hidden"])


def downgrade() -> None:
    op.drop_index("ix_product_variants_is_hidden", table_name="product_variants")
    op.drop_column("product_variants", "is_hidden")
