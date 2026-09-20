"""assets demirbas fields: serial_no, current_value, status, maintenance_date

Revision ID: 015
Revises: 014
Create Date: 2026-09-20 18:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("serial_no", sa.String(100), nullable=True))
    op.add_column("assets", sa.Column("current_value", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "assets",
        sa.Column("status", sa.String(40), nullable=False, server_default="Aktif"),
    )
    op.add_column("assets", sa.Column("maintenance_date", sa.Date(), nullable=True))
    op.create_index("ix_assets_status", "assets", ["status"])
    op.create_index("ix_assets_maintenance_date", "assets", ["maintenance_date"])


def downgrade() -> None:
    op.drop_index("ix_assets_maintenance_date", table_name="assets")
    op.drop_index("ix_assets_status", table_name="assets")
    op.drop_column("assets", "maintenance_date")
    op.drop_column("assets", "status")
    op.drop_column("assets", "current_value")
    op.drop_column("assets", "serial_no")
