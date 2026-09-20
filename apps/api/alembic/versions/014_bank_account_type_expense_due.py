"""bank account_type/institution + expense due_date/document_no

Revision ID: 014
Revises: 013
Create Date: 2026-09-20 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("account_type", sa.String(40), nullable=False, server_default="Banka"),
    )
    op.add_column("bank_accounts", sa.Column("institution", sa.String(150), nullable=True))
    op.create_index("ix_bank_accounts_account_type", "bank_accounts", ["account_type"])

    op.add_column("expenses", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("expenses", sa.Column("document_no", sa.String(50), nullable=True))
    op.create_index("ix_expenses_due_date", "expenses", ["due_date"])


def downgrade() -> None:
    op.drop_index("ix_expenses_due_date", table_name="expenses")
    op.drop_column("expenses", "document_no")
    op.drop_column("expenses", "due_date")
    op.drop_index("ix_bank_accounts_account_type", table_name="bank_accounts")
    op.drop_column("bank_accounts", "institution")
    op.drop_column("bank_accounts", "account_type")
