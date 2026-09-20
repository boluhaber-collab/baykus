"""Generic cost items (Maliyet Yönetimi) beyond DTF scenarios."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CostItem(Base):
    __tablename__ = "cost_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    unit: Mapped[str | None] = mapped_column(String(40), default="adet")
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    note: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
