"""Expense (Gider) models under finance."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

EXPENSE_PAYMENT_METHODS = ("nakit", "banka")


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    document_no: Mapped[str | None] = mapped_column(String(50))
    payment_method: Mapped[str] = mapped_column(String(20), default="nakit")  # nakit | banka
    note: Mapped[str | None] = mapped_column(Text)
    cash_register_id: Mapped[int | None] = mapped_column(
        ForeignKey("cash_registers.id", ondelete="SET NULL")
    )
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL")
    )
    cash_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("cash_movements.id", ondelete="SET NULL")
    )
    bank_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_movements.id", ondelete="SET NULL")
    )
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    category: Mapped[ExpenseCategory] = relationship(back_populates="expenses", lazy="joined")
