"""WhatsApp template and local send-log models (no real WhatsApp API)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

WA_CATEGORIES = [
    "hazır sipariş",
    "ödeme hatırlatma",
    "tasarım onayı",
    "teslimat",
    "kampanya",
]


class WhatsAppTemplate(Base):
    __tablename__ = "whatsapp_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WhatsAppSendLog(Base):
    __tablename__ = "whatsapp_send_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_templates.id", ondelete="SET NULL"), index=True
    )
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    rendered_body: Mapped[str] = mapped_column(Text, nullable=False)
    wa_link: Mapped[str] = mapped_column(Text, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    template = relationship("WhatsAppTemplate", lazy="joined")
