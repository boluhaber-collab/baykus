"""Yerel e-posta kutusu — SMTP gönderim + IMAP gelen kayıtları."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MailMessage(Base):
    __tablename__ = "mail_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folder: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # inbox | sent
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="out")  # in | out
    message_id: Mapped[str | None] = mapped_column(String(255), index=True)
    imap_uid: Mapped[str | None] = mapped_column(String(64), index=True)
    from_addr: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    to_addrs: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cc_addrs: Mapped[str | None] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_html: Mapped[str | None] = mapped_column(Text)
    date_sent: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    error: Mapped[str | None] = mapped_column(String(500))
    # JSON list: [{filename, content_type, size, stored_name}]
    attachments_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
