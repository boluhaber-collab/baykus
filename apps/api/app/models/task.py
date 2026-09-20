"""Görev / Hatırlatma (desktop gorev_yonetimi_penceresi)."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

TASK_TYPES = (
    "Müşteri aranacak",
    "Teklif takip edilecek",
    "Ödeme hatırlatılacak",
    "Ürün tedarik edilecek",
    "Tasarım onayı beklenecek",
    "Diğer",
)
TASK_PRIORITIES = ("Normal", "Yüksek", "Düşük")
TASK_STATUSES = ("Açık", "Tamamlandı")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_time: Mapped[str | None] = mapped_column(String(10))
    task_type: Mapped[str] = mapped_column(String(80), default="Diğer")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    order_number: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(40), default="Açık", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="Normal")
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
