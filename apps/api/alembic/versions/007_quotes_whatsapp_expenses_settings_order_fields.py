"""quotes, whatsapp, expenses, settings, order channel/design fields

Revision ID: 007
Revises: 006
Create Date: 2026-09-20 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("channel", sa.String(50), server_default="mağaza"))
    op.add_column("orders", sa.Column("design_status", sa.String(50), server_default="bekliyor"))
    op.add_column("orders", sa.Column("design_notes", sa.Text()))
    op.add_column("orders", sa.Column("delivery_date", sa.Date()))
    op.create_index("ix_orders_channel", "orders", ["channel"])
    op.create_index("ix_orders_design_status", "orders", ["design_status"])

    op.create_table(
        "quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quote_number", sa.String(50), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(50), server_default="Taslak"),
        sa.Column("total_amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("valid_until", sa.Date()),
        sa.Column("notes", sa.Text()),
        sa.Column("converted_order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL")),
        sa.Column("is_cancelled", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_quotes_quote_number", "quotes", ["quote_number"], unique=True)
    op.create_index("ix_quotes_status", "quotes", ["status"])
    op.create_index("ix_quotes_converted_order_id", "quotes", ["converted_order_id"])

    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quote_id", sa.Integer(), sa.ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL")),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL")),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1"),
        sa.Column("size", sa.String(50)),
        sa.Column("color", sa.String(50)),
        sa.Column("print_type", sa.String(100)),
        sa.Column("unit_price", sa.Numeric(12, 2), server_default="0"),
        sa.Column("discount_rate", sa.Numeric(5, 2), server_default="0"),
        sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("line_total", sa.Numeric(12, 2), server_default="0"),
    )

    op.create_table(
        "whatsapp_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_whatsapp_templates_name", "whatsapp_templates", ["name"], unique=True)
    op.create_index("ix_whatsapp_templates_category", "whatsapp_templates", ["category"])

    op.create_table(
        "whatsapp_send_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("whatsapp_templates.id", ondelete="SET NULL")),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("rendered_body", sa.Text(), nullable=False),
        sa.Column("wa_link", sa.Text(), nullable=False),
        sa.Column("customer_name", sa.String(255)),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_whatsapp_send_logs_template_id", "whatsapp_send_logs", ["template_id"])

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_app_settings_key", "app_settings", ["key"], unique=True)

    op.create_table(
        "expense_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_expense_categories_name", "expense_categories", ["name"], unique=True)

    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("payment_method", sa.String(20), server_default="nakit"),
        sa.Column("note", sa.Text()),
        sa.Column("cash_register_id", sa.Integer(), sa.ForeignKey("cash_registers.id", ondelete="SET NULL")),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("bank_accounts.id", ondelete="SET NULL")),
        sa.Column("cash_movement_id", sa.Integer(), sa.ForeignKey("cash_movements.id", ondelete="SET NULL")),
        sa.Column("bank_movement_id", sa.Integer(), sa.ForeignKey("bank_movements.id", ondelete="SET NULL")),
        sa.Column("is_posted", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"])
    op.create_index("ix_expenses_expense_date", "expenses", ["expense_date"])


def downgrade() -> None:
    op.drop_table("expenses")
    op.drop_table("expense_categories")
    op.drop_table("app_settings")
    op.drop_table("whatsapp_send_logs")
    op.drop_table("whatsapp_templates")
    op.drop_table("quote_lines")
    op.drop_table("quotes")
    op.drop_index("ix_orders_design_status", table_name="orders")
    op.drop_index("ix_orders_channel", table_name="orders")
    op.drop_column("orders", "delivery_date")
    op.drop_column("orders", "design_notes")
    op.drop_column("orders", "design_status")
    op.drop_column("orders", "channel")
