"""order design files, price lists, loans, audit logs

Revision ID: 008
Revises: 007
Create Date: 2026-09-20 20:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_design_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120)),
        sa.Column("size_bytes", sa.Integer(), server_default="0"),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_order_design_files_order_id", "order_design_files", ["order_id"])

    op.create_table(
        "price_lists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("currency", sa.String(3), server_default="TRY"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_to", sa.Date()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_price_lists_name", "price_lists", ["name"])

    op.create_table(
        "price_list_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL")),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL")),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), server_default="0"),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_to", sa.Date()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_price_list_items_price_list_id", "price_list_items", ["price_list_id"])

    op.create_table(
        "loans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("lender", sa.String(150)),
        sa.Column("principal_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("interest_rate", sa.Numeric(7, 4)),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("installment_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(30), server_default="aktif"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_loans_status", "loans", ["status"])

    op.create_table(
        "loan_installments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("loan_id", sa.Integer(), sa.ForeignKey("loans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_paid", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("paid_at", sa.DateTime()),
        sa.Column("payment_method", sa.String(30)),
        sa.Column("cash_register_id", sa.Integer(), sa.ForeignKey("cash_registers.id", ondelete="SET NULL")),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("bank_accounts.id", ondelete="SET NULL")),
        sa.Column("cash_movement_id", sa.Integer(), sa.ForeignKey("cash_movements.id", ondelete="SET NULL")),
        sa.Column("bank_movement_id", sa.Integer(), sa.ForeignKey("bank_movements.id", ondelete="SET NULL")),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_loan_installments_loan_id", "loan_installments", ["loan_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(50)),
        sa.Column("detail", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("loan_installments")
    op.drop_table("loans")
    op.drop_table("price_list_items")
    op.drop_table("price_lists")
    op.drop_table("order_design_files")
