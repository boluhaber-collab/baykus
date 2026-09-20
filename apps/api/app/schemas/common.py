from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class Message(BaseModel):
    message: str


class KPIStats(BaseModel):
    """Legacy KPI payload — kept for /api/dashboard/kpis compatibility."""

    customers: int
    products: int
    open_orders: int
    revenue_month: float
    pending_quotes: int


class StatusCount(BaseModel):
    status: str
    count: int


class LowStockBrief(BaseModel):
    product_id: int
    sku: str
    name: str
    stock_qty: int
    threshold: int
    variant_id: int | None = None


class RecentOrderBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str | None = None
    status: str
    total_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime


class RecentCariPaymentBrief(BaseModel):
    id: int
    customer_id: int
    customer_name: str | None = None
    credit: Decimal
    movement_date: date
    note: str | None = None
    order_number: str | None = None


class RecentFinanceMovementBrief(BaseModel):
    source: str  # cash | bank
    id: int
    movement_type: str
    amount: Decimal
    direction: str
    movement_date: date
    account_name: str | None = None
    note: str | None = None




class UpcomingSpecialDayBrief(BaseModel):
    id: int
    name: str
    event_date: date
    day_type: str
    customer_id: int | None = None
    customer_name: str | None = None
    days_until: int
    note: str | None = None

class DashboardSummary(BaseModel):
    """Real aggregates for the home dashboard."""

    # Orders
    orders_today_count: int = 0
    orders_today_revenue: float = 0.0
    orders_month_count: int = 0
    orders_month_revenue: float = 0.0
    open_orders: int = 0
    status_counts: list[StatusCount] = []

    # Stock
    critical_stock_count: int = 0
    low_stock_items: list[LowStockBrief] = []

    # Customers / cari
    customer_count: int = 0
    receivables_total: float = 0.0
    receivables_customer_count: int = 0

    # Finance
    cash_balance: float = 0.0
    bank_balance: float = 0.0
    total_liquidity: float = 0.0

    # Lists
    recent_orders: list[RecentOrderBrief] = []
    recent_cari_payments: list[RecentCariPaymentBrief] = []
    recent_finance_movements: list[RecentFinanceMovementBrief] = []

    # Legacy-ish counts still useful on cards
    products_count: int = 0

    # CRM
    upcoming_special_days: list[UpcomingSpecialDayBrief] = []
