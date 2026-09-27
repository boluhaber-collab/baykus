"""Shared multi-account (split) payment line — BizimHesap-style kasa/banka rows."""

from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class PaymentLineIn(BaseModel):
    """One tahsilat/ödeme row targeting a cash register or bank account."""

    amount: Decimal = Field(gt=0)
    cash_register_id: int | None = None
    bank_account_id: int | None = None
    method: str | None = Field(default=None, max_length=50)
    payment_type: str | None = None  # Nakit | EFT | Kart | …

    @model_validator(mode="after")
    def require_account(self) -> "PaymentLineIn":
        if self.cash_register_id is None and self.bank_account_id is None:
            raise ValueError("Her ödeme satırında kasa veya banka hesabı seçilmelidir")
        if self.cash_register_id is not None and self.bank_account_id is not None:
            raise ValueError("Bir satırda hem kasa hem banka seçilemez")
        return self
