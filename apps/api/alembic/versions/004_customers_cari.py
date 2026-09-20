"""customers: code/tax_office/active/special/opening; cari_movements

Revision ID: 004
Revises: 003
Create Date: 2026-09-20 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("code", sa.String(50)))
    op.create_index("ix_customers_code", "customers", ["code"], unique=True)
    op.add_column("customers", sa.Column("tax_office", sa.String(100)))
    op.add_column(
        "customers",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
    )
    op.add_column("customers", sa.Column("special_day_note", sa.String(255)))
    op.add_column("customers", sa.Column("special_day_date", sa.Date()))
    op.add_column(
        "customers",
        sa.Column("opening_balance", sa.Numeric(12, 2), server_default="0"),
    )

    op.create_table(
        "cari_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("debit", sa.Numeric(12, 2), server_default="0"),
        sa.Column("credit", sa.Numeric(12, 2), server_default="0"),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "order_id",
            sa.Integer(),
            sa.ForeignKey("orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cari_movements_customer_id", "cari_movements", ["customer_id"])
    op.create_index("ix_cari_movements_movement_type", "cari_movements", ["movement_type"])
    op.create_index("ix_cari_movements_movement_date", "cari_movements", ["movement_date"])


def downgrade() -> None:
    op.drop_index("ix_cari_movements_movement_date", table_name="cari_movements")
    op.drop_index("ix_cari_movements_movement_type", table_name="cari_movements")
    op.drop_index("ix_cari_movements_customer_id", table_name="cari_movements")
    op.drop_table("cari_movements")
    op.drop_column("customers", "opening_balance")
    op.drop_column("customers", "special_day_date")
    op.drop_column("customers", "special_day_note")
    op.drop_column("customers", "is_active")
    op.drop_column("customers", "tax_office")
    op.drop_index("ix_customers_code", table_name="customers")
    op.drop_column("customers", "code")
