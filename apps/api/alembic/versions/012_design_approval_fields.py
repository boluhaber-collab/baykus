"""design approval dates + normalize design_status labels

Revision ID: 012
Revises: 011
Create Date: 2026-09-20 17:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Legacy lowercase → desktop Turkish labels
_REMAP = {
    "bekliyor": "Bekliyor",
    "onaylandı": "Onaylandı",
    "onaylandi": "Onaylandı",
    "revizyon": "Revizyon İstendi",
}


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("design_approved_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("design_whatsapp_at", sa.DateTime(), nullable=True))

    conn = op.get_bind()
    for old, new in _REMAP.items():
        conn.execute(
            sa.text("UPDATE orders SET design_status = :new WHERE lower(design_status) = :old"),
            {"new": new, "old": old},
        )
    # Ensure default-looking empties become Bekliyor
    conn.execute(
        sa.text(
            "UPDATE orders SET design_status = 'Bekliyor' "
            "WHERE design_status IS NULL OR trim(design_status) = ''"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("design_whatsapp_at")
        batch.drop_column("design_approved_at")
