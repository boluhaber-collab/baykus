"""batch 16: expense_categories.group_name

Revision ID: 018
Revises: 017
Create Date: 2026-09-20 21:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "expense_categories",
        sa.Column("group_name", sa.String(100), nullable=True, server_default="İşletme Giderleri"),
    )
    op.create_index("ix_expense_categories_group_name", "expense_categories", ["group_name"])


def downgrade() -> None:
    op.drop_index("ix_expense_categories_group_name", table_name="expense_categories")
    op.drop_column("expense_categories", "group_name")
