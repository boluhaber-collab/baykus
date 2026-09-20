"""bank_accounts, cash_registers, cash_movements, bank_movements

Revision ID: 005
Revises: 004
Create Date: 2026-09-20 15:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_registers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, server_default="Ana Kasa"),
        sa.Column("opening_balance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("currency", sa.String(3), server_default="TRY"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("iban", sa.String(34)),
        sa.Column("currency", sa.String(3), server_default="TRY"),
        sa.Column("opening_balance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_bank_accounts_name", "bank_accounts", ["name"])

    op.create_table(
        "cash_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "cash_register_id",
            sa.Integer(),
            sa.ForeignKey("cash_registers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("note", sa.Text()),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "bank_account_id",
            sa.Integer(),
            sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("transfer_group_id", sa.String(36)),
        sa.Column(
            "cari_movement_id",
            sa.Integer(),
            sa.ForeignKey("cari_movements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cash_movements_cash_register_id", "cash_movements", ["cash_register_id"])
    op.create_index("ix_cash_movements_movement_type", "cash_movements", ["movement_type"])
    op.create_index("ix_cash_movements_movement_date", "cash_movements", ["movement_date"])
    op.create_index("ix_cash_movements_customer_id", "cash_movements", ["customer_id"])
    op.create_index("ix_cash_movements_transfer_group_id", "cash_movements", ["transfer_group_id"])

    op.create_table(
        "bank_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "bank_account_id",
            sa.Integer(),
            sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("note", sa.Text()),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cash_register_id",
            sa.Integer(),
            sa.ForeignKey("cash_registers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "counterpart_bank_account_id",
            sa.Integer(),
            sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("transfer_group_id", sa.String(36)),
        sa.Column(
            "cari_movement_id",
            sa.Integer(),
            sa.ForeignKey("cari_movements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_bank_movements_bank_account_id", "bank_movements", ["bank_account_id"])
    op.create_index("ix_bank_movements_movement_type", "bank_movements", ["movement_type"])
    op.create_index("ix_bank_movements_movement_date", "bank_movements", ["movement_date"])
    op.create_index("ix_bank_movements_customer_id", "bank_movements", ["customer_id"])
    op.create_index("ix_bank_movements_transfer_group_id", "bank_movements", ["transfer_group_id"])


def downgrade() -> None:
    op.drop_index("ix_bank_movements_transfer_group_id", table_name="bank_movements")
    op.drop_index("ix_bank_movements_customer_id", table_name="bank_movements")
    op.drop_index("ix_bank_movements_movement_date", table_name="bank_movements")
    op.drop_index("ix_bank_movements_movement_type", table_name="bank_movements")
    op.drop_index("ix_bank_movements_bank_account_id", table_name="bank_movements")
    op.drop_table("bank_movements")

    op.drop_index("ix_cash_movements_transfer_group_id", table_name="cash_movements")
    op.drop_index("ix_cash_movements_customer_id", table_name="cash_movements")
    op.drop_index("ix_cash_movements_movement_date", table_name="cash_movements")
    op.drop_index("ix_cash_movements_movement_type", table_name="cash_movements")
    op.drop_index("ix_cash_movements_cash_register_id", table_name="cash_movements")
    op.drop_table("cash_movements")

    op.drop_index("ix_bank_accounts_name", table_name="bank_accounts")
    op.drop_table("bank_accounts")
    op.drop_table("cash_registers")
