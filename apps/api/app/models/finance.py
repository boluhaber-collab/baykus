"""Cash (Kasa) and Bank (Banka) finance models."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Cash movement types (Turkish domain)
CASH_IN_TYPES = ("tahsilat", "transfer_in")
CASH_OUT_TYPES = ("odeme", "gider", "transfer_out")
CASH_MOVEMENT_TYPES = CASH_IN_TYPES + CASH_OUT_TYPES

# Bank movement types
BANK_IN_TYPES = ("deposit", "transfer_in")
BANK_OUT_TYPES = ("withdrawal", "transfer_out", "fee")
BANK_MOVEMENT_TYPES = BANK_IN_TYPES + BANK_OUT_TYPES


class CashRegister(Base):
    """Daily cash drawer / kasa."""

    __tablename__ = "cash_registers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="Ana Kasa")
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="TRY")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    movements: Mapped[list["CashMovement"]] = relationship(
        back_populates="cash_register", cascade="all, delete-orphan"
    )


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    account_type: Mapped[str] = mapped_column(String(40), default="Banka", index=True)
    institution: Mapped[str | None] = mapped_column(String(150))  # Banka / Kurum
    iban: Mapped[str | None] = mapped_column(String(34))
    currency: Mapped[str] = mapped_column(String(3), default="TRY")
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    movements: Mapped[list["BankMovement"]] = relationship(
        back_populates="bank_account",
        cascade="all, delete-orphan",
        foreign_keys="BankMovement.bank_account_id",
    )


class CashMovement(Base):
    __tablename__ = "cash_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cash_register_id: Mapped[int] = mapped_column(
        ForeignKey("cash_registers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    movement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL")
    )
    transfer_group_id: Mapped[str | None] = mapped_column(String(36), index=True)
    cari_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("cari_movements.id", ondelete="SET NULL")
    )
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    supplier_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("supplier_movements.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    cash_register: Mapped[CashRegister] = relationship(back_populates="movements")
    customer = relationship("Customer", lazy="joined")
    bank_account = relationship("BankAccount", lazy="joined")


class BankMovement(Base):
    __tablename__ = "bank_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    movement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    cash_register_id: Mapped[int | None] = mapped_column(
        ForeignKey("cash_registers.id", ondelete="SET NULL")
    )
    counterpart_bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL")
    )
    transfer_group_id: Mapped[str | None] = mapped_column(String(36), index=True)
    cari_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("cari_movements.id", ondelete="SET NULL")
    )
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    supplier_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("supplier_movements.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bank_account: Mapped[BankAccount] = relationship(
        back_populates="movements", foreign_keys=[bank_account_id]
    )
    customer = relationship("Customer", lazy="joined")

# Account types mirror desktop banka_hesaplari_paneli
BANK_ACCOUNT_TYPES = ("Banka", "POS", "Kredi Kartı", "Şirket Ortağı")
