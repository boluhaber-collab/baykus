"""expenses.is_cancelled soft-delete for iptal

Revision ID: 020
Revises: 019
Create Date: 2026-10-07 20:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "expenses",
        sa.Column("is_cancelled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_index("ix_expenses_is_cancelled", "expenses", ["is_cancelled"])


def downgrade() -> None:
    op.drop_index("ix_expenses_is_cancelled", table_name="expenses")
    op.drop_column("expenses", "is_cancelled")
