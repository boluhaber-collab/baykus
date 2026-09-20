"""Price lists (Fiyat listeleri)."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PriceList(Base):
    __tablename__ = "price_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3), default="TRY")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    items: Mapped[list["PriceListItem"]] = relationship(
        back_populates="price_list", cascade="all, delete-orphan", order_by="PriceListItem.id"
    )


class PriceListItem(Base):
    __tablename__ = "price_list_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    price_list_id: Mapped[int] = mapped_column(
        ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL")
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # Desktop fiyat listesi alanları
    supplier_name: Mapped[str | None] = mapped_column(String(255))
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    blank_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # Baskısız
    printed_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # Baskılı
    embroidered_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # Nakışlı
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    price_list: Mapped[PriceList] = relationship(back_populates="items")
