from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DtfCalcIn(BaseModel):
    film_m2: Decimal = Field(ge=0)
    film_unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    ink_cost: Decimal = Field(default=Decimal("0"), ge=0)
    labor_cost: Decimal = Field(default=Decimal("0"), ge=0)
    waste_percent: Decimal = Field(default=Decimal("0"), ge=0)
    quantity: int = Field(default=1, ge=1)


class DtfCalcOut(BaseModel):
    film_cost: Decimal
    base_cost: Decimal
    waste_cost: Decimal
    total_cost: Decimal
    unit_cost: Decimal
    quantity: int


class DtfDesktopCalcIn(BaseModel):
    """Masaüstü dtf_maliyet_hesaplama_araci alanları."""
    metretul: Decimal = Field(ge=0)
    alis_usd_mt: Decimal = Field(ge=0, description="Alış Fiyatı ($/mt)")
    satis_usd_mt: Decimal = Field(ge=0, description="Satış Fiyatı ($/mt)")
    kur: Decimal = Field(gt=0, description="Dolar Kuru (TL)")


class DtfDesktopCalcOut(BaseModel):
    metretul: Decimal
    alis_usd: Decimal
    satis_usd: Decimal
    kar_usd: Decimal
    alis_tl: Decimal
    satis_tl: Decimal
    kar_tl: Decimal
    kar_marji: Decimal
    birim_alis_tl: Decimal


class DtfSettings(BaseModel):
    metretul: Decimal = Field(default=Decimal("13.32"))
    alis_usd_mt: Decimal = Field(default=Decimal("2"))
    satis_usd_mt: Decimal = Field(default=Decimal("6"))
    kur: Decimal = Field(default=Decimal("43"))


class DtfScenarioCreate(DtfCalcIn):
    name: str = Field(min_length=1, max_length=150)
    note: str | None = None


class DtfScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    film_m2: Decimal | None = None
    film_unit_price: Decimal | None = None
    ink_cost: Decimal | None = None
    labor_cost: Decimal | None = None
    waste_percent: Decimal | None = None
    quantity: int | None = Field(default=None, ge=1)
    note: str | None = None


class DtfScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    film_m2: Decimal
    film_unit_price: Decimal
    ink_cost: Decimal
    labor_cost: Decimal
    waste_percent: Decimal
    quantity: int
    note: str | None = None
    unit_cost: Decimal | None = None
    total_cost: Decimal | None = None
    created_at: datetime
    updated_at: datetime
