"""orders: line details, deposit, status history

Revision ID: 002
Revises: 001
Create Date: 2026-09-20 13:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("deposit_amount", sa.Numeric(12, 2), server_default="0"))
    op.add_column("orders", sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0"))
    op.add_column("orders", sa.Column("due_date", sa.Date()))

    op.add_column("order_lines", sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id", ondelete="SET NULL")))
    op.add_column("order_lines", sa.Column("size", sa.String(50)))
    op.add_column("order_lines", sa.Column("color", sa.String(50)))
    op.add_column("order_lines", sa.Column("print_type", sa.String(100)))
    op.add_column("order_lines", sa.Column("discount_rate", sa.Numeric(5, 2), server_default="0"))
    op.add_column("order_lines", sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0"))

    # Migrate old English/slug statuses to Turkish labels
    op.execute(
        """
        UPDATE orders SET status = CASE status
            WHEN 'yeni' THEN 'Sipariş Alındı'
            WHEN 'onay' THEN 'Sipariş Alındı'
            WHEN 'uretim' THEN 'Hazırlanıyor'
            WHEN 'baski' THEN 'Baskıda'
            WHEN 'hazir' THEN 'Hazır'
            WHEN 'teslim' THEN 'Teslim Edildi'
            WHEN 'iptal' THEN 'Sipariş İptali'
            ELSE status
        END
        """
    )
    op.alter_column("orders", "status", server_default="Sipariş Alındı")

    op.create_table(
        "order_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", sa.String(50)),
        sa.Column("to_status", sa.String(50), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("changed_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_status_history_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")
    op.drop_column("order_lines", "discount_amount")
    op.drop_column("order_lines", "discount_rate")
    op.drop_column("order_lines", "print_type")
    op.drop_column("order_lines", "color")
    op.drop_column("order_lines", "size")
    op.drop_column("order_lines", "variant_id")
    op.drop_column("orders", "due_date")
    op.drop_column("orders", "discount_amount")
    op.drop_column("orders", "deposit_amount")
    op.alter_column("orders", "status", server_default="yeni")
