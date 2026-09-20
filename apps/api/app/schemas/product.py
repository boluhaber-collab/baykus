from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class VariantBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(min_length=1, max_length=64)
    color: str | None = None
    size: str | None = None
    print_type: str | None = None
    barcode: str | None = None
    price: Decimal = Decimal("0")
    stock_qty: int = 0


class VariantCreate(VariantBase):
    pass


class VariantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = None
    size: str | None = None
    print_type: str | None = None
    barcode: str | None = None
    price: Decimal | None = None
    stock_qty: int | None = None


class VariantOut(VariantBase):
    id: int
    product_id: int
    is_critical: bool = False

    model_config = {"from_attributes": True}


class ProductBase(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    category: str | None = None
    brand: str | None = None
    supplier_name: str | None = None
    product_type: str = "stoklu"  # stoklu | hizmet
    description: str | None = None
    base_price: Decimal = Decimal("0")  # satış fiyatı
    purchase_price: Decimal = Decimal("0")
    cost: Decimal = Decimal("0")
    photo_url: str | None = None
    is_active: bool = True
    critical_stock_threshold: int = 10
    warehouse: str | None = "Ana Depo"


class ProductCreate(ProductBase):
    stock_qty: int = 0
    variants: list[VariantCreate] = []


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    brand: str | None = None
    supplier_name: str | None = None
    product_type: str | None = None
    description: str | None = None
    base_price: Decimal | None = None
    purchase_price: Decimal | None = None
    cost: Decimal | None = None
    photo_url: str | None = None
    is_active: bool | None = None
    critical_stock_threshold: int | None = None
    warehouse: str | None = None
    stock_qty: int | None = None
    variants: list[VariantCreate] | None = None


class ProductListItem(BaseModel):
    id: int
    sku: str
    name: str
    category: str | None = None
    brand: str | None = None
    product_type: str
    base_price: Decimal
    purchase_price: Decimal = Decimal("0")
    cost: Decimal = Decimal("0")
    stock_qty: int
    total_stock: int
    critical_stock_threshold: int
    is_critical: bool
    is_active: bool
    warehouse: str | None = None
    variants_count: int = 0
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class StockMovementOut(BaseModel):
    id: int
    product_id: int
    variant_id: int | None
    direction: str
    quantity: int
    qty_before: int
    qty_after: int
    reason: str | None
    note: str | None
    warehouse: str | None
    created_by_user_id: int | None
    created_at: datetime
    variant_sku: str | None = None
    variant_name: str | None = None

    model_config = {"from_attributes": True}


class ProductDetail(ProductBase):
    id: int
    stock_qty: int
    total_stock: int
    is_critical: bool
    created_at: datetime
    updated_at: datetime
    variants: list[VariantOut] = []
    recent_movements: list[StockMovementOut] = []

    model_config = {"from_attributes": True}


class StockAdjustIn(BaseModel):
    direction: str = Field(description="increase | decrease")
    quantity: int = Field(gt=0)
    variant_id: int | None = None
    reason: str | None = Field(default=None, max_length=255)
    note: str | None = None
    warehouse: str | None = None


class StockAdjustOut(BaseModel):
    product_id: int
    variant_id: int | None
    direction: str
    quantity: int
    qty_before: int
    qty_after: int
    total_stock: int
    movement_id: int


class CriticalStockItem(BaseModel):
    product_id: int
    product_sku: str
    product_name: str
    category: str | None
    variant_id: int | None
    variant_sku: str | None
    variant_name: str | None
    stock_qty: int
    critical_stock_threshold: int
    warehouse: str | None
