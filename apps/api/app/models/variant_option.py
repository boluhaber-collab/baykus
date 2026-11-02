"""Catalog variants (Tür / Değer / Not) — desktop Varyant Yönetimi parity."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VariantOption(Base):
    __tablename__ = "variant_options"
    __table_args__ = (
        UniqueConstraint("kind", "value", name="uq_variant_option_kind_value"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(80), nullable=False, index=True)  # Tür
    value: Mapped[str] = mapped_column(String(120), nullable=False)  # Değer
    note: Mapped[str | None] = mapped_column(Text)
    # Ayarlar > Varyant Yönetimi'nde sürükle-bırak sırası (ürün kartı açılır listeleri bu sırayı izler)
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
