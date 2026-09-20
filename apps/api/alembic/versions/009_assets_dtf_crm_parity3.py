"""assets, dtf_scenarios, special_days, campaigns

Revision ID: 009
Revises: 008
Create Date: 2026-09-20 15:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("depreciation_method", sa.String(30), server_default="none"),
        sa.Column("useful_life_months", sa.Integer()),
        sa.Column("note", sa.Text()),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assets_name", "assets", ["name"])

    op.create_table(
        "dtf_scenarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("film_m2", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("ink_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("labor_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("waste_percent", sa.Numeric(7, 2), nullable=False, server_default="0"),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("film_unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("note", sa.Text()),
        sa.Column("unit_cost", sa.Numeric(12, 4)),
        sa.Column("total_cost", sa.Numeric(12, 2)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_dtf_scenarios_name", "dtf_scenarios", ["name"])

    op.create_table(
        "special_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("day_type", sa.String(40), nullable=False, server_default="diğer"),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL")),
        sa.Column("note", sa.Text()),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_special_days_event_date", "special_days", ["event_date"])
    op.create_index("ix_special_days_customer_id", "special_days", ["customer_id"])

    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_campaigns_title", "campaigns", ["title"])


def downgrade() -> None:
    op.drop_index("ix_campaigns_title", table_name="campaigns")
    op.drop_table("campaigns")
    op.drop_index("ix_special_days_customer_id", table_name="special_days")
    op.drop_index("ix_special_days_event_date", table_name="special_days")
    op.drop_table("special_days")
    op.drop_index("ix_dtf_scenarios_name", table_name="dtf_scenarios")
    op.drop_table("dtf_scenarios")
    op.drop_index("ix_assets_name", table_name="assets")
    op.drop_table("assets")
