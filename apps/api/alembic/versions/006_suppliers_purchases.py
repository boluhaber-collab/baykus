"""suppliers, supplier_movements, purchases, purchase_lines + finance supplier FKs

Revision ID: 006
Revises: 005
Create Date: 2026-09-20 16:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("phone", sa.String(50)),
        sa.Column("city", sa.String(100)),
        sa.Column("address", sa.Text()),
        sa.Column("tax_number", sa.String(50)),
        sa.Column("tax_office", sa.String(100)),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("opening_balance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_suppliers_code", "suppliers", ["code"], unique=True)
    op.create_index("ix_suppliers_name", "suppliers", ["name"])

    op.create_table(
        "purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("purchase_number", sa.String(50), nullable=False),
        sa.Column(
            "supplier_id",
            sa.Integer(),
            sa.ForeignKey("suppliers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft"),
        sa.Column("notes", sa.Text()),
        sa.Column("subtotal", sa.Numeric(12, 2), server_default="0"),
        sa.Column("tax_amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("total_amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("confirmed_at", sa.DateTime()),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_purchases_purchase_number", "purchases", ["purchase_number"], unique=True)
    op.create_index("ix_purchases_supplier_id", "purchases", ["supplier_id"])
    op.create_index("ix_purchases_purchase_date", "purchases", ["purchase_date"])
    op.create_index("ix_purchases_status", "purchases", ["status"])

    op.create_table(
        "purchase_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "purchase_id",
            sa.Integer(),
            sa.ForeignKey("purchases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id", ondelete="SET NULL"),
        ),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 2), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
    )
    op.create_index("ix_purchase_lines_purchase_id", "purchase_lines", ["purchase_id"])

    op.create_table(
        "supplier_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "supplier_id",
            sa.Integer(),
            sa.ForeignKey("suppliers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("debit", sa.Numeric(12, 2), server_default="0"),
        sa.Column("credit", sa.Numeric(12, 2), server_default="0"),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "purchase_id",
            sa.Integer(),
            sa.ForeignKey("purchases.id", ondelete="SET NULL"),
        ),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_supplier_movements_supplier_id", "supplier_movements", ["supplier_id"])
    op.create_index("ix_supplier_movements_movement_type", "supplier_movements", ["movement_type"])
    op.create_index("ix_supplier_movements_movement_date", "supplier_movements", ["movement_date"])

    op.add_column(
        "cash_movements",
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id", ondelete="SET NULL")),
    )
    op.add_column(
        "cash_movements",
        sa.Column(
            "supplier_movement_id",
            sa.Integer(),
            sa.ForeignKey("supplier_movements.id", ondelete="SET NULL"),
        ),
    )
    op.create_index("ix_cash_movements_supplier_id", "cash_movements", ["supplier_id"])

    op.add_column(
        "bank_movements",
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id", ondelete="SET NULL")),
    )
    op.add_column(
        "bank_movements",
        sa.Column(
            "supplier_movement_id",
            sa.Integer(),
            sa.ForeignKey("supplier_movements.id", ondelete="SET NULL"),
        ),
    )
    op.create_index("ix_bank_movements_supplier_id", "bank_movements", ["supplier_id"])


def downgrade() -> None:
    op.drop_index("ix_bank_movements_supplier_id", table_name="bank_movements")
    op.drop_column("bank_movements", "supplier_movement_id")
    op.drop_column("bank_movements", "supplier_id")
    op.drop_index("ix_cash_movements_supplier_id", table_name="cash_movements")
    op.drop_column("cash_movements", "supplier_movement_id")
    op.drop_column("cash_movements", "supplier_id")
    op.drop_table("supplier_movements")
    op.drop_table("purchase_lines")
    op.drop_table("purchases")
    op.drop_table("suppliers")
