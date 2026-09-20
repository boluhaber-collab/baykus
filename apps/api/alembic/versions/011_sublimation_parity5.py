"""sublimation_print_times + document archive_tag

Revision ID: 011
Revises: 010
Create Date: 2026-09-20 17:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sublimation_print_times",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("size", sa.String(50)),
        sa.Column("minutes", sa.Float(), server_default="0"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_sublimation_print_times_product_name", "sublimation_print_times", ["product_name"])
    # optional archive tag on documents
    with op.batch_alter_table("documents") as batch:
        batch.add_column(sa.Column("archive_tag", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch:
        batch.drop_column("archive_tag")
    op.drop_index("ix_sublimation_print_times_product_name", table_name="sublimation_print_times")
    op.drop_table("sublimation_print_times")
