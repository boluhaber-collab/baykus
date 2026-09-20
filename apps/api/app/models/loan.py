"""Loans / installments (Kredi / taksit)."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

LOAN_STATUSES = ["aktif", "kapandı", "iptal"]
DEFAULT_LOAN_STATUS = "aktif"


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    lender: Mapped[str | None] = mapped_column(String(150))
    principal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    installment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(30), default=DEFAULT_LOAN_STATUS, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    installments: Mapped[list["LoanInstallment"]] = relationship(
        back_populates="loan", cascade="all, delete-orphan", order_by="LoanInstallment.sequence"
    )


class LoanInstallment(Base):
    __tablename__ = "loan_installments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    loan_id: Mapped[int] = mapped_column(
        ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    payment_method: Mapped[str | None] = mapped_column(String(30))  # nakit | banka | none
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
    notes: Mapped[str | None] = mapped_column(Text)

    loan: Mapped[Loan] = relationship(back_populates="installments")
