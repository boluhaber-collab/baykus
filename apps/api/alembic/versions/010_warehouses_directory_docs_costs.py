"""warehouses, directory_contacts, documents, cost_items

Revision ID: 010
Revises: 009
Create Date: 2026-09-20 16:40:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "warehouses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(40)),
        sa.Column("address", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_warehouses_name", "warehouses", ["name"], unique=True)
    op.create_index("ix_warehouses_code", "warehouses", ["code"], unique=True)

    op.create_table(
        "directory_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("company", sa.String(255)),
        sa.Column("phone", sa.String(50)),
        sa.Column("email", sa.String(255)),
        sa.Column("city", sa.String(100)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_directory_contacts_name", "directory_contacts", ["name"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120)),
        sa.Column("size_bytes", sa.Integer(), server_default="0"),
        sa.Column("notes", sa.Text()),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_documents_title", "documents", ["title"])
    op.create_index("ix_documents_category", "documents", ["category"])
    op.create_index("ix_documents_stored_filename", "documents", ["stored_filename"], unique=True)

    op.create_table(
        "cost_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("unit", sa.String(40), server_default="adet"),
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("note", sa.Text()),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cost_items_category", "cost_items", ["category"])
    op.create_index("ix_cost_items_name", "cost_items", ["name"])


def downgrade() -> None:
    op.drop_index("ix_cost_items_name", table_name="cost_items")
    op.drop_index("ix_cost_items_category", table_name="cost_items")
    op.drop_table("cost_items")
    op.drop_index("ix_documents_stored_filename", table_name="documents")
    op.drop_index("ix_documents_category", table_name="documents")
    op.drop_index("ix_documents_title", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_directory_contacts_name", table_name="directory_contacts")
    op.drop_table("directory_contacts")
    op.drop_index("ix_warehouses_code", table_name="warehouses")
    op.drop_index("ix_warehouses_name", table_name="warehouses")
    op.drop_table("warehouses")
