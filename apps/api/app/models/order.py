from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Exact Turkish labels matching desktop Baykuş Baskı
ORDER_STATUSES = [
    "Sipariş Alındı",
    "Hazırlanıyor",
    "Baskıda",
    "Hazır",
    "Teslim Edildi",
    "Sipariş İptali",
]

DEFAULT_ORDER_STATUS = "Sipariş Alındı"
CLOSED_STATUSES = frozenset({"Teslim Edildi", "Sipariş İptali"})

ORDER_CHANNELS = [
    "mağaza",
    "perakende",
    "internet",
    "Trendyol",
    "Hepsiburada",
    "N11",
    "diğer",
]
DEFAULT_ORDER_CHANNEL = "mağaza"

# Desktop Tasarım Onay Akışı labels (siparis_detay_penceresi_ac)
DESIGN_STATUSES = [
    "Bekliyor",
    "Onay İstendi",
    "Onaylandı",
    "Revizyon İstendi",
    "Revize Edildi",
    "İptal",
]
DEFAULT_DESIGN_STATUS = "Bekliyor"

# Legacy lowercase values from earlier web seeds / migrations
DESIGN_STATUS_ALIASES = {
    "bekliyor": "Bekliyor",
    "onaylandı": "Onaylandı",
    "onaylandi": "Onaylandı",
    "revizyon": "Revizyon İstendi",
    "onay istendi": "Onay İstendi",
    "revizyon istendi": "Revizyon İstendi",
    "revize edildi": "Revize Edildi",
    "iptal": "İptal",
}


def normalize_design_status(value: str | None) -> str:
    if value is None:
        return DEFAULT_DESIGN_STATUS
    raw = str(value).strip()
    if not raw:
        return DEFAULT_DESIGN_STATUS
    if raw in DESIGN_STATUSES:
        return raw
    mapped = DESIGN_STATUS_ALIASES.get(raw.casefold())
    if mapped:
        return mapped
    # Case-insensitive match against canonical labels
    lower_map = {s.casefold(): s for s in DESIGN_STATUSES}
    return lower_map.get(raw.casefold(), DEFAULT_DESIGN_STATUS)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(50), default=DEFAULT_ORDER_STATUS, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    due_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(50), default="mağaza", index=True)
    design_status: Mapped[str] = mapped_column(String(50), default=DEFAULT_DESIGN_STATUS, index=True)
    design_notes: Mapped[str | None] = mapped_column(Text)
    design_approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    design_whatsapp_at: Mapped[datetime | None] = mapped_column(DateTime)
    delivery_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", lazy="joined")
    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderLine.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusHistory.id"
    )
    design_files: Mapped[list["OrderDesignFile"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderDesignFile.id"
    )


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    size: Mapped[str | None] = mapped_column(String(50))
    color: Mapped[str | None] = mapped_column(String(50))
    print_type: Mapped[str | None] = mapped_column(String(100))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    order: Mapped[Order] = relationship(back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(50), default="nakit")
    status: Mapped[str] = mapped_column(String(50), default="tamamlandi")
    paid_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="payments")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status: Mapped[str | None] = mapped_column(String(50))
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    changed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    order: Mapped[Order] = relationship(back_populates="status_history")


class OrderDesignFile(Base):
    """Uploaded design asset metadata for an order (files on disk under uploads/designs/)."""

    __tablename__ = "order_design_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    order: Mapped[Order] = relationship(back_populates="design_files")
