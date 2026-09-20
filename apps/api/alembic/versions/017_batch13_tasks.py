"""batch 13: tasks table for görev/hatırlatma

Revision ID: 017
Revises: 016
Create Date: 2026-09-20 20:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("due_time", sa.String(10), nullable=True),
        sa.Column("task_type", sa.String(80), nullable=False, server_default="Diğer"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("order_number", sa.String(50), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="Açık"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="Normal"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"])
    op.create_index("ix_tasks_status", "tasks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_tasks_status", table_name="tasks")
    op.drop_index("ix_tasks_due_date", table_name="tasks")
    op.drop_table("tasks")
