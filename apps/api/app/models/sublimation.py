"""Sublimasyon baskı süreleri (ürün / beden / süre metni)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SublimationPrintTime(Base):
    __tablename__ = "sublimation_print_times"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    size: Mapped[str | None] = mapped_column(String(50))
    minutes: Mapped[float] = mapped_column(Float, default=0)
    # Masaüstü "Baskı Süresi" serbest metin (örn. 45 sn / 180°C)
    duration_text: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)  # Diğer Talimatlar
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
