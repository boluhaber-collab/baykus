"""Reports module — real aggregates from orders, stock, cari, suppliers, finance."""

from __future__ import annotations

import csv
import io
from calendar import monthrange
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import Integer, String, and_, case, cast, exists, func, literal, or_, union_all
from sqlalchemy.sql import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.customer import CariMovement, Customer
from app.models.finance import (
    BANK_IN_TYPES,
    CASH_IN_TYPES,
    BankMovement,
    CashMovement,
)
from app.models.order import ORDER_STATUSES, Order
from app.models.product import Product, ProductVariant
from app.models.warehouse import WarehouseStock
from app.models.supplier import Purchase, Supplier, SupplierMovement
from app.models.user import User

from app.utils.bh_note import sanitize_display_note

router = APIRouter(prefix="/reports", tags=["reports"])

READ_ROLES = ("admin", "muhasebe", "satış")


def _f(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _dec(v: Any) -> Decimal:
    return Decimal(str(v or 0))


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _day_end(d: date) -> datetime:
    return datetime.combine(d, time(23, 59, 59))


def _wants_csv(request: Request, fmt: str | None) -> bool:
    if fmt and fmt.lower() == "csv":
        return True
    accept = (request.headers.get("accept") or "").lower()
    return "text/csv" in accept and not accept.strip().startswith("application/json")


def _csv_response(filename: str, headers: list[str], rows: list[list[Any]]) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _paid_amount(order: Order) -> Decimal:
    return sum((_dec(p.amount) for p in (order.payments or [])), Decimal("0"))


def _remaining(order: Order) -> Decimal:
    paid = _paid_amount(order)
    effective = paid if paid > 0 else _dec(order.deposit_amount)
    return max(_dec(order.total_amount) - effective, Decimal("0"))


# ── Catalog ────────────────────────────────────────────────────────────────


@router.get("")
def list_reports(_: User = Depends(require_roles(*READ_ROLES))) -> dict:
    return {
        "reports": [
            {
                "key": "sales",
                "title": "Satış raporu",
                "path": "/api/reports/sales",
                "href": "/reports/sales",
                "description": "Cari satış hareketleri (BH ekstre + perakende + yerel): adet, ciro (tarih aralığı)",
            },
            {
                "key": "stock",
                "title": "Stok raporu",
                "path": "/api/reports/stock",
                "href": "/reports/stock",
                "description": "Ürün/varyant miktar, değer tahmini, kritik bayrak",
            },
            {
                "key": "receivables",
                "title": "Cari / alacak raporu",
                "path": "/api/reports/receivables",
                "href": "/reports/receivables",
                "description": "Müşteri bakiyeleri ve toplam alacak",
            },
            {
                "key": "payables",
                "title": "Tedarikçi borç raporu",
                "path": "/api/reports/payables",
                "href": "/reports/payables",
                "description": "Tedarikçi borç bakiyeleri",
            },
            {
                "key": "finance",
                "title": "Kasa / banka hareket raporu",
                "path": "/api/reports/finance",
                "href": "/reports/finance",
                "description": "Kasa ve banka hareketleri (tarih aralığı)",
            },
            {
                "key": "profit",
                "title": "Kâr Analizi",
                "path": "/api/reports/profit",
                "href": "/reports/profit",
                "description": "Ciro, maliyet yaklaşımı, kâr — masaüstü Kâr Analizi paneli",
            },
            {
                "key": "expenses",
                "title": "Masraf raporları",
                "path": "/api/reports/expenses",
                "href": "/reports/expenses",
                "description": "Gider / masraf dökümü (tarih, kategori)",
            },
            {
                "key": "purchases",
                "title": "Alış Raporu",
                "path": "/api/reports/purchases",
                "href": "/reports/purchases",
                "description": "Satın alma belgelerinin özeti",
            },
            {
                "key": "cari_statements",
                "title": "Cari Dökümler",
                "path": "/api/reports/cari-statements",
                "href": "/reports/cari-statements",
                "description": "Müşteri seç → cari ekstre (CSV)",
            },
            {
                "key": "archive",
                "title": "Belge Arşiv Merkezi",
                "path": "/api/documents",
                "href": "/reports/archive",
                "description": "Arşiv etiketli evraklar",
            },
            {
                "key": "sales_6m",
                "title": "6 Aylık Satışlar",
                "path": "/api/reports/sales-6m",
                "href": "/reports/sales-6m",
                "description": "Son 6 ay aylık ciro",
            },
            {
                "key": "sales_by_category",
                "title": "Kategori Bazlı Satış",
                "path": "/api/reports/sales-by-category",
                "href": "/reports/sales-by-category",
                "description": "Ürün kategorisine göre ciro",
            },
            {
                "key": "product_buy_sell",
                "title": "Ürün Alış-Satış",
                "path": "/api/reports/product-buy-sell",
                "href": "/reports/product-buy-sell",
                "description": "Ürün bazlı alış ve satış",
            },
            {
                "key": "stock_movements",
                "title": "Stok Hareketleri",
                "path": "/api/reports/stock-movements",
                "href": "/reports/stock-movements",
                "description": "Stok giriş/çıkış hareketleri",
            },
            {
                "key": "stock_idle",
                "title": "Hareket Görmeyen Ürünler",
                "path": "/api/reports/stock-idle",
                "href": "/reports/stock-idle",
                "description": "Son X günde hareket yok",
            },
            {
                "key": "stock_sales_coverage",
                "title": "Stok-Satış Karşılama",
                "path": "/api/reports/stock-sales-coverage",
                "href": "/reports/stock-sales-coverage",
                "description": "Stok vs satış miktarı",
            },
            {
                "key": "account_balances",
                "title": "Hesap Bakiyeleri",
                "path": "/api/reports/account-balances",
                "href": "/reports/account-balances",
                "description": "Kasa / banka bakiyeleri",
            },
            {
                "key": "quotes",
                "title": "Teklifler",
                "path": "/api/reports/quotes",
                "href": "/reports/quotes",
                "description": "Teklif özeti",
            },
        ]
    }


# ── Shared sales query ─────────────────────────────────────────────────────
# Source of truth: cari_movements.movement_type == "sale"
# (BH Detaylı Ekstre import + local order side-effects). Orders table alone is
# empty after demo wipe even when real BH sales remain on cari.


def _sale_ref(m: CariMovement, parsed: dict[str, Any], order: Order | None) -> str:
    if order and order.order_number:
        return order.order_number
    belge = parsed.get("belge")
    if belge:
        return str(belge)
    return f"SAT-{m.id}"


def _sale_note_display(parsed: dict[str, Any], m: CariMovement) -> str | None:
    kalem = parsed.get("kalem_raw")
    if kalem:
        return str(kalem)[:200]
    display = sanitize_display_note(m.note) or None
    if display:
        return display[:200]
    hareket = parsed.get("hareket")
    return str(hareket) if hareket else None


def _sales_data(
    db: Session,
    date_from: date | None,
    date_to: date | None,
    status: str | None,
) -> tuple[dict, list[dict]]:
    from app.utils.bh_note import parse_bh_note

    q = (
        db.query(CariMovement)
        .options(
            joinedload(CariMovement.customer),
            joinedload(CariMovement.order).joinedload(Order.payments),
        )
        .filter(CariMovement.movement_type == "sale")
    )
    if date_from:
        q = q.filter(CariMovement.movement_date >= date_from)
    if date_to:
        q = q.filter(CariMovement.movement_date <= date_to)

    moves = q.order_by(CariMovement.movement_date.desc(), CariMovement.id.desc()).all()

    rows_out: list[dict] = []
    total_revenue = Decimal("0")
    total_remaining = Decimal("0")
    cancelled_count = 0
    by_status: dict[str, dict[str, float | int]] = {}

    for m in moves:
        order: Order | None = m.order if m.order_id else None
        if status:
            if order and order.status != status:
                continue
            if not order and status not in ("Satış", "sale"):
                continue

        parsed = parse_bh_note(m.note)
        amt = _dec(m.debit)
        if amt <= 0 and order is not None:
            amt = _dec(order.total_amount)

        paid = Decimal("0")
        rem = amt
        due = None
        cancelled = bool(order and order.status == "Sipariş İptali")
        if order is not None:
            paid = _paid_amount(order)
            if paid <= 0:
                paid = _dec(order.deposit_amount)
            rem = Decimal("0") if cancelled else (
                max(amt - paid, Decimal("0")) if paid > 0 else _remaining(order)
            )
            due = order.due_date.isoformat() if order.due_date else None
            st = order.status or "Satış"
            source = "order"
        else:
            st = "Satış"
            source = "cari"

        if cancelled:
            cancelled_count += 1
        else:
            total_revenue += amt
            total_remaining += rem

        bucket = by_status.setdefault(st, {"count": 0, "revenue": 0.0})
        bucket["count"] = int(bucket["count"]) + 1
        if not cancelled:
            bucket["revenue"] = float(bucket["revenue"]) + _f(amt)

        rows_out.append(
            {
                "id": m.id,
                "order_number": _sale_ref(m, parsed, order),
                "customer_id": m.customer_id,
                "customer_name": m.customer.name if m.customer else None,
                "status": st,
                "total_amount": _f(amt),
                "paid_amount": _f(paid),
                "remaining_amount": _f(rem),
                "created_at": m.movement_date.isoformat() if m.movement_date else None,
                "due_date": due,
                "source": source,
                "note": _sale_note_display(parsed, m),
                "order_id": order.id if order else None,
            }
        )

    summary = {
        "order_count": len(rows_out),
        "sale_count": len(rows_out),
        "revenue": _f(total_revenue),
        "remaining": _f(total_remaining),
        "cancelled_count": cancelled_count,
        "by_status": [
            {"status": k, "count": int(v["count"]), "revenue": float(v["revenue"])}
            for k, v in sorted(by_status.items(), key=lambda x: -int(x[1]["count"]))
        ],
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "status_filter": status,
        "source": "cari_sales",
        "assumptions": [
            "Satışlar cari hareketlerinden (movement_type=sale): BH ekstre + Perakende Satışlar (GetSalesReport) + yerel sipariş.",
            "Perakende Satışlar müşteri kartı (BH:PERAKENDE) GetSalesReport satırlarından materialize edilir — Eylül ciro BH portal ile hizalanır.",
            "Demo wipe sonrası siparişler boş olsa da BH satışları burada görünür.",
            "İptal siparişe bağlı cari satışlar ciroya dahil edilmez.",
        ],
    }
    return summary, rows_out


@router.get("/sales")
def sales_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
    format: str | None = Query(default=None, description="json | csv"),
):
    summary, rows_out = _sales_data(db, date_from, date_to, status)

    if _wants_csv(request, format):
        headers = [
            "Belge/No",
            "Müşteri",
            "Tip",
            "Tutar",
            "Ödenen",
            "Kalan",
            "Tarih",
            "Kaynak",
            "Açıklama",
        ]
        csv_rows = [
            [
                r["order_number"],
                r["customer_name"] or "",
                r["status"],
                r["total_amount"],
                r["paid_amount"],
                r["remaining_amount"],
                r["created_at"] or "",
                r.get("source") or "",
                r.get("note") or "",
            ]
            for r in rows_out
        ]
        return _csv_response("satis_raporu.csv", headers, csv_rows)

    return {"summary": summary, "rows": rows_out}


@router.get("/sales/print", response_class=HTMLResponse)
def sales_print(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
):
    summary, rows = _sales_data(db, date_from, date_to, status)
    trs = "".join(
        f"<tr><td>{r['order_number']}</td><td>{r['customer_name'] or ''}</td>"
        f"<td>{r['status']}</td><td style='text-align:right'>{r['total_amount']:.2f}</td>"
        f"<td>{(r['created_at'] or '')[:10]}</td>"
        f"<td>{(r.get('note') or '')[:80]}</td></tr>"
        for r in rows
    )
    html = f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>Satış Raporu</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}}
h1{{font-size:1.25rem}} table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #cbd5e1;padding:6px 8px}} th{{background:#f1f5f9;text-align:left}}
.meta{{margin:12px 0;font-size:13px}} @media print{{button{{display:none}}}}
</style></head><body>
<button onclick="window.print()">Yazdır</button>
<h1>Satış Raporu</h1>
<div class="meta">Adet: {summary['order_count']} · Ciro: {summary['revenue']:.2f} TRY
· Kaynak: cari satış hareketleri · Aralık: {summary.get('date_from') or '—'} → {summary.get('date_to') or '—'}</div>
<table><thead><tr><th>Belge/No</th><th>Müşteri</th><th>Tip</th><th>Tutar</th><th>Tarih</th><th>Açıklama</th></tr></thead>
<tbody>{trs or '<tr><td colspan="6">Kayıt yok</td></tr>'}</tbody></table>
</body></html>"""
    return HTMLResponse(html)


# ── Stock ──────────────────────────────────────────────────────────────────


@router.get("/stock")
def stock_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    critical_only: bool = Query(default=False),
    value_basis: Literal["cost", "sale"] = Query(default="cost"),
    format: str | None = Query(default=None),
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    brand: str | None = Query(default=None),
    product_type: str | None = Query(default=None, alias="type"),
    active_only: bool = Query(default=True),
    color: str | None = Query(default=None),
    size: str | None = Query(default=None),
    colors: list[str] | None = Query(default=None),
    sizes: list[str] | None = Query(default=None),
    print_type: str | None = Query(default=None),
    sku: str | None = Query(default=None),
    warehouse: str | None = Query(default=None),
    in_stock_only: bool = Query(default=True),
    skip: int = Query(default=0, ge=0),
    limit: int | None = Query(default=None, ge=1, le=500),
):
    """Stok Değeri / Depo Durumu — BH product stock-value list filters.

    JSON responses page variant rows (skip/limit). Summary counts stay on the
    full filtered set. CSV and print ignore paging and export every matching row.
    """

    def _terms(single: str | None, many: list[str] | None) -> list[str]:
        raw: list[str] = []
        if single and single.strip():
            raw.append(single.strip())
        for item in many or []:
            if item and item.strip():
                raw.append(item.strip())
        seen: set[str] = set()
        out: list[str] = []
        for term in raw:
            key = term.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(term)
        return out

    color_terms = _terms(color, colors)
    size_terms = _terms(size, sizes)
    color_keys = {t.lower() for t in color_terms}
    size_keys = {t.lower() for t in size_terms}

    unit_cost = case(
        (Product.cost > 0, Product.cost),
        else_=func.coalesce(Product.purchase_price, 0),
    )
    v_sale = case(
        (ProductVariant.price > 0, ProductVariant.price),
        else_=func.coalesce(Product.base_price, 0),
    )
    p_sale = func.coalesce(Product.base_price, 0)
    wh_label = literal(warehouse.strip()) if warehouse and str(warehouse).strip() else Product.warehouse
    # Direct calls (stock_print) may pass FastAPI Query defaults; only real ints page.
    page_skip = skip if isinstance(skip, int) and skip > 0 else 0
    page_limit = limit if isinstance(limit, int) and limit > 0 else None
    # CSV always exports the full filtered set.
    if _wants_csv(request, format if isinstance(format, str) or format is None else None):
        page_limit = None
        page_skip = 0

    prod_filters = []
    if isinstance(q, str) and q.strip():
        like = f"%{q.strip()}%"
        prod_filters.append(
            or_(
                Product.name.ilike(like),
                Product.sku.ilike(like),
                Product.brand.ilike(like),
                Product.category.ilike(like),
            )
        )
    if isinstance(category, str) and category:
        prod_filters.append(Product.category == category)
    if isinstance(brand, str) and brand:
        prod_filters.append(Product.brand == brand)
    if isinstance(product_type, str) and product_type:
        prod_filters.append(Product.product_type == product_type)
    if active_only is True or active_only is False:
        if active_only:
            prod_filters.append(Product.is_active.is_(True))
    elif active_only:
        # Query(default=True) object from a direct call — keep historical default.
        prod_filters.append(Product.is_active.is_(True))

    if isinstance(warehouse, str) and warehouse.strip():
        wh = warehouse.strip()
        wh_exists = exists().where(
            and_(
                WarehouseStock.product_id == Product.id,
                WarehouseStock.warehouse == wh,
                WarehouseStock.quantity > 0,
            )
        )
        prod_filters.append(or_(Product.warehouse == wh, wh_exists))

    var_filters = list(prod_filters)
    if color_terms:
        var_filters.append(or_(*[ProductVariant.color.ilike(term) for term in color_terms]))
    if size_terms:
        var_filters.append(or_(*[ProductVariant.size.ilike(term) for term in size_terms]))
    if isinstance(print_type, str) and print_type.strip():
        var_filters.append(ProductVariant.print_type.ilike(print_type.strip()))
    if isinstance(sku, str) and sku.strip():
        like_sku = f"%{sku.strip()}%"
        var_filters.append(
            or_(
                ProductVariant.sku.ilike(like_sku),
                ProductVariant.name.ilike(like_sku),
                Product.sku.ilike(like_sku),
                Product.name.ilike(like_sku),
            )
        )
    in_stock_flag = bool(in_stock_only) if isinstance(in_stock_only, bool) else True
    critical_flag = bool(critical_only) if isinstance(critical_only, bool) else False
    if in_stock_flag:
        var_filters.append(func.coalesce(ProductVariant.stock_qty, 0) > 0)
    if critical_flag:
        var_filters.append(
            func.coalesce(ProductVariant.stock_qty, 0) < func.coalesce(Product.critical_stock_threshold, 0)
        )

    v_value = (unit_cost if value_basis == "cost" else v_sale) * func.coalesce(ProductVariant.stock_qty, 0)
    v_crit = func.coalesce(ProductVariant.stock_qty, 0) < func.coalesce(Product.critical_stock_threshold, 0)
    v_sel = select(
        Product.id.label("product_id"),
        ProductVariant.sku.label("sku"),
        Product.name.label("name"),
        ProductVariant.id.label("variant_id"),
        ProductVariant.name.label("variant_name"),
        Product.category.label("category"),
        Product.brand.label("brand"),
        wh_label.label("warehouse"),
        ProductVariant.color.label("color"),
        ProductVariant.size.label("size"),
        ProductVariant.print_type.label("print_type"),
        func.coalesce(ProductVariant.stock_qty, 0).label("qty"),
        func.coalesce(Product.critical_stock_threshold, 0).label("threshold"),
        v_crit.label("is_critical"),
        unit_cost.label("unit_cost"),
        v_sale.label("unit_sale"),
        v_value.label("value"),
        literal(value_basis).label("value_basis"),
        Product.product_type.label("product_type"),
        Product.is_active.label("is_active"),
    ).select_from(ProductVariant).join(Product, Product.id == ProductVariant.product_id)
    if var_filters:
        v_sel = v_sel.where(and_(*var_filters))

    selects = [v_sel]
    if not (color_terms or size_terms or (isinstance(print_type, str) and print_type.strip())):
        plain_filters = list(prod_filters)
        plain_filters.append(~exists().where(ProductVariant.product_id == Product.id))
        if isinstance(sku, str) and sku.strip():
            like_sku = f"%{sku.strip()}%"
            plain_filters.append(or_(Product.sku.ilike(like_sku), Product.name.ilike(like_sku)))
        if in_stock_flag:
            plain_filters.append(
                or_(
                    func.coalesce(Product.stock_qty, 0) > 0,
                    Product.product_type == "hizmet",
                )
            )
        if critical_flag:
            plain_filters.append(
                func.coalesce(Product.stock_qty, 0) < func.coalesce(Product.critical_stock_threshold, 0)
            )
        p_value = (unit_cost if value_basis == "cost" else p_sale) * func.coalesce(Product.stock_qty, 0)
        p_crit = func.coalesce(Product.stock_qty, 0) < func.coalesce(Product.critical_stock_threshold, 0)
        p_sel = select(
            Product.id.label("product_id"),
            Product.sku.label("sku"),
            Product.name.label("name"),
            cast(literal(None), Integer).label("variant_id"),
            cast(literal(None), String).label("variant_name"),
            Product.category.label("category"),
            Product.brand.label("brand"),
            wh_label.label("warehouse"),
            cast(literal(None), String).label("color"),
            cast(literal(None), String).label("size"),
            cast(literal(None), String).label("print_type"),
            func.coalesce(Product.stock_qty, 0).label("qty"),
            func.coalesce(Product.critical_stock_threshold, 0).label("threshold"),
            p_crit.label("is_critical"),
            unit_cost.label("unit_cost"),
            p_sale.label("unit_sale"),
            p_value.label("value"),
            literal(value_basis).label("value_basis"),
            Product.product_type.label("product_type"),
            Product.is_active.label("is_active"),
        ).where(and_(*plain_filters))
        selects.append(p_sel)

    combined = union_all(*selects).subquery("stock_rows")
    agg = db.query(
        func.count(),
        func.coalesce(func.sum(combined.c.qty), 0),
        func.coalesce(func.sum(combined.c.value), 0),
        func.coalesce(func.sum(case((combined.c.is_critical.is_(True), 1), else_=0)), 0),
        func.coalesce(func.sum(combined.c.unit_cost * combined.c.qty), 0),
        func.coalesce(func.sum(combined.c.unit_sale * combined.c.qty), 0),
    ).one()
    total_rows = int(agg[0] or 0)
    filtered_value = _dec(agg[2])
    summary = {
        "row_count": total_rows,
        "total_qty": int(agg[1] or 0),
        "total_value_cost": _f(agg[4]),
        "total_value_sale": _f(agg[5]),
        "total_value": _f(filtered_value),
        "critical_count": int(agg[3] or 0),
        "value_basis": value_basis,
        "critical_only": critical_flag,
        "in_stock_only": in_stock_flag,
        "active_only": bool(active_only),
        "page": (page_skip // page_limit + 1) if page_limit else 1,
        "page_size": page_limit or total_rows,
        "assumptions": [
            "BH Stok Değeri filtreleri: aktif, kategori, marka, tür, renk/beden (çoklu), baskı, depo, SKU, stokta.",
            "Maliyet birimi: product.cost; yoksa purchase_price.",
            "Satış birimi: varyant.price (varsa) yoksa product.base_price.",
            "Kritik: qty < critical_stock_threshold.",
            "Değer = miktar × birim (seçilen baz).",
            "Varsayılan: aktif ürünler + stokta olanlar (BH ürün stok listesi).",
            "Liste sayfalanır (varsayılan 50). Özet tüm filtreli satırların toplamıdır; CSV tam listeyi indirir.",
        ],
    }

    row_q = db.query(combined).order_by(combined.c.name, combined.c.variant_id)
    if page_limit:
        row_q = row_q.offset(page_skip).limit(page_limit)
    rows_out: list[dict] = []
    for r in row_q.all():
        rows_out.append(
            {
                "product_id": r.product_id,
                "sku": r.sku,
                "name": r.name,
                "variant_id": r.variant_id,
                "variant_name": r.variant_name,
                "category": r.category,
                "brand": r.brand,
                "warehouse": r.warehouse,
                "color": r.color,
                "size": r.size,
                "print_type": r.print_type,
                "qty": int(r.qty or 0),
                "threshold": int(r.threshold or 0),
                "is_critical": bool(r.is_critical),
                "unit_cost": _f(r.unit_cost),
                "unit_sale": _f(r.unit_sale),
                "value": _f(r.value),
                "value_basis": r.value_basis,
                "product_type": r.product_type,
                "is_active": bool(r.is_active),
            }
        )

    if _wants_csv(request, format if isinstance(format, str) or format is None else None):
        headers = [
            "SKU",
            "Ürün",
            "Varyant",
            "Kategori",
            "Marka",
            "Renk",
            "Beden",
            "Baskı",
            "Depo",
            "Miktar",
            "Eşik",
            "Kritik",
            "Birim maliyet",
            "Birim satış",
            "Değer",
            "Değer baz",
        ]
        csv_rows = [
            [
                r["sku"],
                r["name"],
                r["variant_name"] or "",
                r["category"] or "",
                r.get("brand") or "",
                r.get("color") or "",
                r.get("size") or "",
                r.get("print_type") or "",
                r["warehouse"] or "",
                r["qty"],
                r["threshold"],
                "Evet" if r["is_critical"] else "Hayır",
                r["unit_cost"],
                r["unit_sale"],
                r["value"],
                r["value_basis"],
            ]
            for r in rows_out
        ]
        return _csv_response("stok_raporu.csv", headers, csv_rows)

    return {
        "summary": summary,
        "rows": rows_out,
        "total": total_rows,
        "page": summary["page"],
        "page_size": summary["page_size"],
    }



@router.get("/stock/print", response_class=HTMLResponse)
def stock_print(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    critical_only: bool = Query(default=False),
    value_basis: Literal["cost", "sale"] = Query(default="cost"),
):
    class _Req:
        headers: dict = {}

    result = stock_report(
        request=_Req(),  # type: ignore[arg-type]
        db=db,
        _=_,
        critical_only=critical_only,
        value_basis=value_basis,
        format=None,
        q=None,
        category=None,
        brand=None,
        product_type=None,
        active_only=True,
        color=None,
        size=None,
        colors=None,
        sizes=None,
        print_type=None,
        sku=None,
        warehouse=None,
        in_stock_only=True,
        skip=0,
        limit=None,
    )
    assert isinstance(result, dict)
    s = result["summary"]
    rows = result["rows"]
    trs = "".join(
        f"<tr><td>{r['sku']}</td><td>{r['name']}</td><td>{r['variant_name'] or ''}</td>"
        f"<td style='text-align:right'>{r['qty']}</td>"
        f"<td>{'Kritik' if r['is_critical'] else ''}</td>"
        f"<td style='text-align:right'>{r['value']:.2f}</td></tr>"
        for r in rows
    )
    html = f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>Stok Raporu</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}}
h1{{font-size:1.25rem}} table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #cbd5e1;padding:6px 8px}} th{{background:#f1f5f9;text-align:left}}
.meta{{margin:12px 0;font-size:13px}} @media print{{button{{display:none}}}}
</style></head><body>
<button onclick="window.print()">Yazdır</button>
<h1>Stok Raporu</h1>
<div class="meta">Satır: {s['row_count']} · Miktar: {s['total_qty']} · Değer ({s['value_basis']}): {s['total_value']:.2f} TRY
· Kritik: {s['critical_count']}</div>
<table><thead><tr><th>SKU</th><th>Ürün</th><th>Varyant</th><th>Miktar</th><th>Kritik</th><th>Değer</th></tr></thead>
<tbody>{trs or '<tr><td colspan="6">Kayıt yok</td></tr>'}</tbody></table>
</body></html>"""
    return HTMLResponse(html)


# ── Receivables ────────────────────────────────────────────────────────────


@router.get("/receivables")
def receivables_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    include_zero: bool = Query(default=False),
    format: str | None = Query(default=None),
):
    customers = db.query(Customer).order_by(Customer.name).all()
    ids = [c.id for c in customers]
    bal_map: dict[int, tuple[Decimal, Decimal]] = {}
    last_map: dict[int, date | None] = {}
    if ids:
        rows = (
            db.query(
                CariMovement.customer_id,
                func.coalesce(func.sum(CariMovement.debit), 0),
                func.coalesce(func.sum(CariMovement.credit), 0),
                func.max(CariMovement.movement_date),
            )
            .filter(CariMovement.customer_id.in_(ids))
            .group_by(CariMovement.customer_id)
            .all()
        )
        for r in rows:
            bal_map[r[0]] = (_dec(r[1]), _dec(r[2]))
            last_map[r[0]] = r[3]

    rows_out: list[dict] = []
    total_positive = Decimal("0")
    total_negative = Decimal("0")
    with_balance = 0

    for c in customers:
        debit_s, credit_s = bal_map.get(c.id, (Decimal("0"), Decimal("0")))
        opening = _dec(c.opening_balance)
        balance = opening + debit_s - credit_s
        if not include_zero and balance == 0:
            continue
        if balance > 0:
            total_positive += balance
            with_balance += 1
        elif balance < 0:
            total_negative += balance
        rows_out.append(
            {
                "customer_id": c.id,
                "code": c.code,
                "name": c.name,
                "company": c.company,
                "phone": c.phone,
                "city": c.city,
                "opening_balance": _f(opening),
                "debit_sum": _f(debit_s),
                "credit_sum": _f(credit_s),
                "balance": _f(balance),
                "last_movement_date": last_map.get(c.id).isoformat() if last_map.get(c.id) else None,
                "is_active": bool(c.is_active),
            }
        )

    rows_out.sort(key=lambda x: x["balance"], reverse=True)

    summary = {
        "customer_count": len(rows_out),
        "with_positive_balance": with_balance,
        "total_receivables": _f(total_positive),
        "total_credit_balances": _f(total_negative),
        "net": _f(total_positive + total_negative),
        "include_zero": include_zero,
        "assumptions": [
            "Bakiye = açılış + borç (debit) − alacak (credit).",
            "Pozitif bakiye = müşteriden alacak.",
        ],
    }

    if _wants_csv(request, format):
        headers = [
            "Kod",
            "Müşteri",
            "Firma",
            "Şehir",
            "Telefon",
            "Açılış",
            "Borç",
            "Alacak",
            "Bakiye",
            "Son hareket",
        ]
        csv_rows = [
            [
                r["code"] or "",
                r["name"],
                r["company"] or "",
                r["city"] or "",
                r["phone"] or "",
                r["opening_balance"],
                r["debit_sum"],
                r["credit_sum"],
                r["balance"],
                r["last_movement_date"] or "",
            ]
            for r in rows_out
        ]
        return _csv_response("cari_alacak_raporu.csv", headers, csv_rows)

    return {"summary": summary, "rows": rows_out}


# ── Payables ───────────────────────────────────────────────────────────────


@router.get("/payables")
def payables_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    include_zero: bool = Query(default=False),
    format: str | None = Query(default=None),
):
    suppliers = db.query(Supplier).order_by(Supplier.name).all()
    ids = [s.id for s in suppliers]
    bal_map: dict[int, tuple[Decimal, Decimal]] = {}
    last_map: dict[int, date | None] = {}
    if ids:
        rows = (
            db.query(
                SupplierMovement.supplier_id,
                func.coalesce(func.sum(SupplierMovement.debit), 0),
                func.coalesce(func.sum(SupplierMovement.credit), 0),
                func.max(SupplierMovement.movement_date),
            )
            .filter(SupplierMovement.supplier_id.in_(ids))
            .group_by(SupplierMovement.supplier_id)
            .all()
        )
        for r in rows:
            bal_map[r[0]] = (_dec(r[1]), _dec(r[2]))
            last_map[r[0]] = r[3]

    rows_out: list[dict] = []
    total_payable = Decimal("0")
    with_balance = 0

    for s in suppliers:
        debit_s, credit_s = bal_map.get(s.id, (Decimal("0"), Decimal("0")))
        opening = _dec(s.opening_balance)
        balance = opening + debit_s - credit_s
        if not include_zero and balance == 0:
            continue
        if balance > 0:
            total_payable += balance
            with_balance += 1
        rows_out.append(
            {
                "supplier_id": s.id,
                "code": s.code,
                "name": s.name,
                "phone": s.phone,
                "city": s.city,
                "opening_balance": _f(opening),
                "debit_sum": _f(debit_s),
                "credit_sum": _f(credit_s),
                "balance": _f(balance),
                "last_movement_date": last_map.get(s.id).isoformat() if last_map.get(s.id) else None,
                "is_active": bool(s.is_active),
            }
        )

    rows_out.sort(key=lambda x: x["balance"], reverse=True)

    summary = {
        "supplier_count": len(rows_out),
        "with_positive_balance": with_balance,
        "total_payables": _f(total_payable),
        "include_zero": include_zero,
        "assumptions": [
            "Bakiye = açılış + borç (debit/satın alma) − ödeme (credit).",
            "Pozitif bakiye = tedarikçiye borç.",
        ],
    }

    if _wants_csv(request, format):
        headers = [
            "Kod",
            "Tedarikçi",
            "Şehir",
            "Telefon",
            "Açılış",
            "Borç",
            "Ödeme",
            "Bakiye",
            "Son hareket",
        ]
        csv_rows = [
            [
                r["code"] or "",
                r["name"],
                r["city"] or "",
                r["phone"] or "",
                r["opening_balance"],
                r["debit_sum"],
                r["credit_sum"],
                r["balance"],
                r["last_movement_date"] or "",
            ]
            for r in rows_out
        ]
        return _csv_response("tedarikci_borc_raporu.csv", headers, csv_rows)

    return {"summary": summary, "rows": rows_out}


# ── Finance ────────────────────────────────────────────────────────────────


@router.get("/finance")
def finance_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    source: Literal["all", "cash", "bank"] = Query(default="all"),
    format: str | None = Query(default=None),
):
    rows_out: list[dict] = []
    cash_in = Decimal("0")
    cash_out = Decimal("0")
    bank_in = Decimal("0")
    bank_out = Decimal("0")

    if source in ("all", "cash"):
        cq = db.query(CashMovement).options(
            joinedload(CashMovement.cash_register),
            joinedload(CashMovement.customer),
        )
        if date_from:
            cq = cq.filter(CashMovement.movement_date >= date_from)
        if date_to:
            cq = cq.filter(CashMovement.movement_date <= date_to)
        for m in cq.order_by(CashMovement.movement_date.desc(), CashMovement.id.desc()).all():
            amt = _dec(m.amount)
            direction = "in" if m.movement_type in CASH_IN_TYPES else "out"
            if direction == "in":
                cash_in += amt
            else:
                cash_out += amt
            rows_out.append(
                {
                    "source": "cash",
                    "id": m.id,
                    "account_name": m.cash_register.name if m.cash_register else None,
                    "movement_type": m.movement_type,
                    "direction": direction,
                    "amount": _f(amt),
                    "movement_date": m.movement_date.isoformat() if m.movement_date else None,
                    "category": m.category,
                    "note": sanitize_display_note(m.note) or None,
                    "party_name": m.customer.name if m.customer else None,
                }
            )

    if source in ("all", "bank"):
        bq = db.query(BankMovement).options(
            joinedload(BankMovement.bank_account),
            joinedload(BankMovement.customer),
        )
        if date_from:
            bq = bq.filter(BankMovement.movement_date >= date_from)
        if date_to:
            bq = bq.filter(BankMovement.movement_date <= date_to)
        for m in bq.order_by(BankMovement.movement_date.desc(), BankMovement.id.desc()).all():
            amt = _dec(m.amount)
            direction = "in" if m.movement_type in BANK_IN_TYPES else "out"
            if direction == "in":
                bank_in += amt
            else:
                bank_out += amt
            rows_out.append(
                {
                    "source": "bank",
                    "id": m.id,
                    "account_name": m.bank_account.name if m.bank_account else None,
                    "movement_type": m.movement_type,
                    "direction": direction,
                    "amount": _f(amt),
                    "movement_date": m.movement_date.isoformat() if m.movement_date else None,
                    "category": m.category,
                    "note": sanitize_display_note(m.note) or None,
                    "party_name": m.customer.name if m.customer else None,
                }
            )

    rows_out.sort(key=lambda r: (r["movement_date"] or "", r["id"]), reverse=True)

    summary = {
        "movement_count": len(rows_out),
        "cash_in": _f(cash_in),
        "cash_out": _f(cash_out),
        "bank_in": _f(bank_in),
        "bank_out": _f(bank_out),
        "net_cash": _f(cash_in - cash_out),
        "net_bank": _f(bank_in - bank_out),
        "net_total": _f((cash_in - cash_out) + (bank_in - bank_out)),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "source": source,
        "assumptions": [
            "Transfer giriş/çıkış çift kayıt olarak görünebilir (kasa↔banka).",
            "Net = giriş − çıkış (seçilen kaynak).",
        ],
    }

    if _wants_csv(request, format):
        headers = ["Kaynak", "Hesap", "Tip", "Yön", "Tutar", "Tarih", "Kategori", "Taraf", "Not"]
        csv_rows = [
            [
                "Kasa" if r["source"] == "cash" else "Banka",
                r["account_name"] or "",
                r["movement_type"],
                "Giriş" if r["direction"] == "in" else "Çıkış",
                r["amount"],
                r["movement_date"] or "",
                r["category"] or "",
                r["party_name"] or "",
                r["note"] or "",
            ]
            for r in rows_out
        ]
        return _csv_response("kasa_banka_hareket_raporu.csv", headers, csv_rows)

    return {"summary": summary, "rows": rows_out}


# ── Profit ─────────────────────────────────────────────────────────────────


@router.get("/profit")
def profit_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    format: str | None = Query(default=None),
):
    """Simple monthly P&L approximation — see summary.assumptions."""
    now = date.today()
    y = year or now.year
    m = month or now.month
    start, end = _month_bounds(y, m)

    orders = (
        db.query(Order)
        .filter(Order.created_at >= _day_start(start), Order.created_at <= _day_end(end))
        .all()
    )
    revenue = Decimal("0")
    order_count = 0
    cancelled = 0
    order_rows: list[dict] = []
    for o in orders:
        if o.status == "Sipariş İptali":
            cancelled += 1
            continue
        order_count += 1
        revenue += _dec(o.total_amount)
        order_rows.append(
            {
                "kind": "order",
                "ref": o.order_number,
                "date": o.created_at.date().isoformat() if o.created_at else None,
                "status": o.status,
                "amount": _f(o.total_amount),
            }
        )

    purchases = (
        db.query(Purchase)
        .options(joinedload(Purchase.supplier))
        .filter(
            Purchase.status == "confirmed",
            Purchase.purchase_date >= start,
            Purchase.purchase_date <= end,
        )
        .all()
    )
    purchase_cost = Decimal("0")
    purchase_rows: list[dict] = []
    for p in purchases:
        purchase_cost += _dec(p.total_amount)
        purchase_rows.append(
            {
                "kind": "purchase",
                "ref": p.purchase_number,
                "date": p.purchase_date.isoformat() if p.purchase_date else None,
                "supplier": p.supplier.name if p.supplier else None,
                "status": p.status,
                "amount": _f(p.total_amount),
            }
        )

    gross = revenue - purchase_cost

    summary = {
        "year": y,
        "month": m,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "order_count": order_count,
        "cancelled_orders": cancelled,
        "revenue": _f(revenue),
        "confirmed_purchase_count": len(purchases),
        "purchase_costs": _f(purchase_cost),
        "gross_approx": _f(gross),
        "assumptions": [
            "Ciro: ay içi sipariş toplamı (iptaller hariç).",
            "Maliyet yaklaşımı: ay içi ONAYLI satın alma tutarları toplamı — gerçek COGS değil.",
            "Stokta bekleyen / önceki aydan satılan mallar eşleştirilmez.",
            "İşçilik, genel gider, KDV ayrımı yok.",
            "Kar ≈ ciro − onaylı satın alma tutarı (basit özet).",
        ],
    }

    detail = [
        *[{"section": "Satış", **r} for r in order_rows],
        *[{"section": "Satın alma", **r} for r in purchase_rows],
    ]

    if _wants_csv(request, format):
        headers = ["Bölüm", "Ref", "Tarih", "Durum/Tedarikçi", "Tutar"]
        csv_rows: list[list[Any]] = []
        for r in order_rows:
            csv_rows.append(["Satış", r["ref"], r["date"] or "", r["status"], r["amount"]])
        for r in purchase_rows:
            csv_rows.append(
                ["Satın alma", r["ref"], r["date"] or "", r.get("supplier") or "", r["amount"]]
            )
        csv_rows.append([])
        csv_rows.append(["ÖZET", "Ciro", "", "", _f(revenue)])
        csv_rows.append(["ÖZET", "Satın alma maliyeti", "", "", _f(purchase_cost)])
        csv_rows.append(["ÖZET", "Kar yaklaşımı", "", "", _f(gross)])
        return _csv_response(f"kar_ozeti_{y}_{m:02d}.csv", headers, csv_rows)

    return {"summary": summary, "rows": detail, "orders": order_rows, "purchases": purchase_rows}



@router.get("/expenses")
def expenses_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    category_id: int | None = Query(default=None),
    format: str | None = Query(default=None),
):
    """Masraf / gider raporu."""
    from app.models.expense import Expense, ExpenseCategory

    q = db.query(Expense).options(joinedload(Expense.category))
    if date_from:
        q = q.filter(Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(Expense.expense_date <= date_to)
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    rows = q.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    total = sum((_dec(r.amount) for r in rows), Decimal("0"))
    detail = [
        {
            "id": r.id,
            "date": r.expense_date.isoformat() if r.expense_date else None,
            "category": r.category.name if r.category else None,
            "amount": _f(r.amount),
            "payment_method": getattr(r, "payment_method", None),
            "note": sanitize_display_note(getattr(r, "note", None)) or None,
            "posted": bool(getattr(r, "is_posted", False)),
        }
        for r in rows
    ]
    summary = {
        "count": len(rows),
        "total": _f(total),
        "assumptions": [
            "Masraf raporları gider kayıtlarından üretilir.",
            "Kasa/bankaya işlenmiş (posted) kayıtlar ayrıca finans raporunda görünür.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "masraf_raporu.csv",
            ["id", "tarih", "kategori", "tutar", "odeme", "not", "islendi"],
            [[d["id"], d["date"], d["category"], d["amount"], d["payment_method"], d["note"], d["posted"]] for d in detail],
        )
    return {"summary": summary, "rows": detail}


@router.get("/purchases")
def purchases_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str | None = Query(default=None),
):
    """Alış raporu — satın alma belgeleri."""
    from app.models.supplier import Purchase

    q = db.query(Purchase).options(joinedload(Purchase.supplier))
    if date_from:
        q = q.filter(Purchase.purchase_date >= date_from)
    if date_to:
        q = q.filter(Purchase.purchase_date <= date_to)
    rows = q.order_by(Purchase.purchase_date.desc(), Purchase.id.desc()).all()
    total = sum((_dec(r.total_amount) for r in rows), Decimal("0"))
    detail = [
        {
            "id": r.id,
            "number": r.purchase_number,
            "date": r.purchase_date.isoformat() if r.purchase_date else None,
            "supplier": r.supplier.name if r.supplier else None,
            "status": r.status,
            "amount": _f(r.total_amount),
        }
        for r in rows
    ]
    summary = {
        "count": len(rows),
        "total": _f(total),
        "assumptions": ["Alış raporu satın alma belgelerinin tutar toplamıdır."],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "alis_raporu.csv",
            ["id", "belge", "tarih", "tedarikci", "durum", "tutar"],
            [[d["id"], d["number"], d["date"], d["supplier"], d["status"], d["amount"]] for d in detail],
        )
    return {"summary": summary, "rows": detail}


@router.get("/cari-statements")
def cari_statements_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    customer_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str | None = Query(default=None),
):
    """Cari döküm — müşteri seçilince ekstre."""
    from app.models.customer import CariMovement, Customer

    if not customer_id:
        customers = (
            db.query(Customer)
            .filter(Customer.is_active.is_(True))
            .order_by(Customer.name)
            .all()
        )
        return {
            "summary": {"message": "Müşteri seçin", "customer_count": len(customers)},
            "customers": [
                {"id": c.id, "name": c.name, "company": c.company, "balance": _f(getattr(c, "balance", 0) or 0)}
                for c in customers
            ],
            "rows": [],
        }

    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")

    q = db.query(CariMovement).filter(CariMovement.customer_id == customer_id)
    if date_from:
        q = q.filter(CariMovement.movement_date >= date_from)
    if date_to:
        q = q.filter(CariMovement.movement_date <= date_to)
    moves = q.order_by(CariMovement.movement_date.asc(), CariMovement.id.asc()).all()
    running = _dec(getattr(customer, "opening_balance", 0) or 0)
    if date_from:
        prior = (
            db.query(
                func.coalesce(func.sum(CariMovement.debit), 0),
                func.coalesce(func.sum(CariMovement.credit), 0),
            )
            .filter(
                CariMovement.customer_id == customer_id,
                CariMovement.movement_date < date_from,
            )
            .one()
        )
        running = running + _dec(prior[0]) - _dec(prior[1])
    opening = running
    detail = []
    for m in moves:
        running += _dec(m.debit) - _dec(m.credit)
        detail.append(
            {
                "id": m.id,
                "date": m.movement_date.isoformat() if m.movement_date else None,
                "type": m.movement_type,
                "debit": _f(m.debit),
                "credit": _f(m.credit),
                "balance": _f(running),
                "note": sanitize_display_note(m.note) or None,
                "order_id": m.order_id,
            }
        )
    if date_from and date_to:
        period = f"{date_from.isoformat()} → {date_to.isoformat()}"
    elif date_from:
        period = f"{date_from.isoformat()} → …"
    elif date_to:
        period = f"… → {date_to.isoformat()}"
    else:
        period = "Tüm hareketler"
    summary = {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "opening_balance": _f(opening),
        "closing_balance": _f(running),
        "count": len(detail),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "period": period,
        "assumptions": [
            "Borç (debit) alacağı artırır; alacak (credit) tahsilattır.",
            "CSV / basit PDF / yazdırılabilir HTML — masaüstü ReportLab Cari Döküm şablonu değildir.",
            "Tarih aralığı boşsa tüm hareketler; doluysa dönem başı açılış bakiyesi dahil.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            f"cari_dokum_{customer.id}.csv",
            ["id", "tarih", "tip", "borc", "alacak", "bakiye", "not"],
            [[d["id"], d["date"], d["type"], d["debit"], d["credit"], d["balance"], d["note"]] for d in detail],
        )
    if (format or "").lower() == "pdf":
        from fastapi.responses import Response
        from app.services.pdf import build_cari_statement_pdf
        from app.models.settings_model import AppSetting

        settings_map: dict[str, str] = {}
        for row in db.query(AppSetting).all():
            settings_map[row.key] = row.value or ""
        pdf = build_cari_statement_pdf(
            customer.name,
            detail,
            summary["closing_balance"],
            settings_map,
            period_label=summary.get("period"),
            opening_balance=summary.get("opening_balance"),
        )
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cari_dokum_{customer.id}.pdf"'},
        )
    if (format or "").lower() == "html":
        from fastapi.responses import HTMLResponse

        rows_html = "".join(
            f"<tr><td>{d['date'] or ''}</td><td>{d['type']}</td>"
            f"<td style='text-align:right'>{d['debit']:.2f}</td>"
            f"<td style='text-align:right'>{d['credit']:.2f}</td>"
            f"<td style='text-align:right'>{d['balance']:.2f}</td>"
            f"<td>{(d['note'] or '')}</td></tr>"
            for d in detail
        )
        html = f"""<!DOCTYPE html><html><head><meta charset=utf-8>
<title>Cari Döküm — {customer.name}</title>
<style>
body{{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111}}
h1{{font-size:18px;margin:0 0 8px}}
.meta{{color:#64748b;font-size:13px;margin-bottom:16px}}
table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #cbd5e1;padding:6px 8px}}
th{{background:#1e3a5f;color:#fff;text-align:left}}
tr:nth-child(even){{background:#f8fafc}}
@media print{{button{{display:none}}}}
</style></head><body>
<button onclick="window.print()">Yazdır</button>
<h1>Cari Döküm / Ekstre</h1>
<div class="meta">Müşteri: <b>{customer.name}</b> · Kapanış: <b>{summary['closing_balance']:.2f} ₺</b>
· Web basit ekstre (masaüstü ReportLab şablonu değil)</div>
<table><thead><tr><th>Tarih</th><th>Tip</th><th>Borç</th><th>Alacak</th><th>Bakiye</th><th>Not</th></tr></thead>
<tbody>{rows_html}</tbody></table>
</body></html>"""
        return HTMLResponse(html)
    return {"summary": summary, "rows": detail}


@router.get("/last-purchase-prices")
def last_purchase_prices(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    q: str | None = Query(default=None),
):
    """Son alış fiyatları — satın alma satırlarından ürün bazlı son birim maliyet."""
    from app.models.supplier import Purchase, PurchaseLine

    lines = (
        db.query(PurchaseLine)
        .join(Purchase)
        .options(joinedload(PurchaseLine.purchase).joinedload(Purchase.supplier))
        .order_by(Purchase.purchase_date.desc(), PurchaseLine.id.desc())
        .all()
    )
    seen: dict[str, dict] = {}
    for ln in lines:
        key = str(ln.product_id or "") + "|" + (ln.description or "")
        if key in seen:
            continue
        if q:
            blob = f"{ln.description or ''} {ln.product_id or ''}".lower()
            if q.lower() not in blob:
                continue
        pur = ln.purchase
        seen[key] = {
            "product_id": ln.product_id,
            "variant_id": ln.variant_id,
            "description": ln.description,
            "unit_cost": _f(ln.unit_cost),
            "quantity": float(ln.quantity or 0),
            "purchase_number": pur.purchase_number if pur else None,
            "purchase_date": pur.purchase_date.isoformat() if pur and pur.purchase_date else None,
            "supplier": pur.supplier.name if pur and pur.supplier else None,
        }
    rows = list(seen.values())

    # Ürün kartındaki purchase_price yedek (alış yoksa)
    from app.models.product import Product

    product_ids = {r["product_id"] for r in rows if r.get("product_id")}
    products = {
        p.id: p
        for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    for r in rows:
        prod = products.get(r.get("product_id"))
        if prod:
            r["product_name"] = prod.name
            r["sku"] = prod.sku
            r["card_purchase_price"] = float(prod.purchase_price or 0)
            r["card_cost"] = float(prod.cost or 0)
            r["card_sale_price"] = float(prod.base_price or 0)
        else:
            r["product_name"] = None
            r["sku"] = None
            r["card_purchase_price"] = None
            r["card_cost"] = None
            r["card_sale_price"] = None

    # Alış hareketi olmayan ürünleri de ekle (kart fiyatı)
    if not q or True:
        existing_pids = {r["product_id"] for r in rows if r.get("product_id")}
        extras = (
            db.query(Product)
            .filter(Product.is_active.is_(True))
            .order_by(Product.name)
            .limit(500)
            .all()
        )
        for prod in extras:
            if prod.id in existing_pids:
                continue
            if float(prod.purchase_price or 0) <= 0:
                continue
            if q:
                blob = f"{prod.name} {prod.sku or ''}".lower()
                if q.lower() not in blob:
                    continue
            rows.append(
                {
                    "product_id": prod.id,
                    "variant_id": None,
                    "description": prod.name,
                    "unit_cost": float(prod.purchase_price or 0),
                    "quantity": 0,
                    "purchase_number": None,
                    "purchase_date": None,
                    "supplier": prod.supplier_name,
                    "product_name": prod.name,
                    "sku": prod.sku,
                    "card_purchase_price": float(prod.purchase_price or 0),
                    "card_cost": float(prod.cost or 0),
                    "card_sale_price": float(prod.base_price or 0),
                    "source": "product_card",
                }
            )
            existing_pids.add(prod.id)

    return {
        "summary": {
            "count": len(rows),
            "assumptions": [
                "Her ürün/açıklama için en son alış satırı.",
                "Alış yoksa ürün kartı purchase_price kullanılır.",
            ],
        },
        "rows": rows,
    }


# ── BH extended reports ─────────────────────────────────────────────────────


@router.get("/sales-6m")
def sales_six_months(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    format: str | None = Query(default=None),
):
    """Last 6 calendar months revenue by month (cancelled excluded)."""
    today = date.today()
    months: list[tuple[int, int]] = []
    y, m = today.year, today.month
    for _ in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()

    rows_out: list[dict] = []
    total_rev = Decimal("0")
    total_cnt = 0
    for yy, mm in months:
        start, end = _month_bounds(yy, mm)
        moves = (
            db.query(CariMovement)
            .options(joinedload(CariMovement.order))
            .filter(
                CariMovement.movement_type == "sale",
                CariMovement.movement_date >= start,
                CariMovement.movement_date <= end,
            )
            .all()
        )
        rev = Decimal("0")
        cnt = 0
        cancelled = 0
        for m in moves:
            order = m.order if m.order_id else None
            if order and order.status == "Sipariş İptali":
                cancelled += 1
                continue
            cnt += 1
            amt = _dec(m.debit)
            if amt <= 0 and order is not None:
                amt = _dec(order.total_amount)
            rev += amt
        total_rev += rev
        total_cnt += cnt
        rows_out.append(
            {
                "year": yy,
                "month": mm,
                "label": f"{yy}-{mm:02d}",
                "order_count": cnt,
                "sale_count": cnt,
                "cancelled_count": cancelled,
                "revenue": _f(rev),
            }
        )

    summary = {
        "month_count": len(rows_out),
        "order_count": total_cnt,
        "revenue": _f(total_rev),
        "assumptions": [
            "Son 6 takvim ayı (içinde bulunulan ay dahil).",
            "Cari satış hareketleri (BH import + yerel); iptal siparişler hariç.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "alti_aylik_satislar.csv",
            ["Ay", "Sipariş", "İptal", "Ciro"],
            [[r["label"], r["order_count"], r["cancelled_count"], r["revenue"]] for r in rows_out],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/sales-by-category")
def sales_by_category(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str | None = Query(default=None),
):
    """Aggregate order line totals by product category."""
    from app.models.order import OrderLine

    q = (
        db.query(OrderLine)
        .join(Order, OrderLine.order_id == Order.id)
        .options(joinedload(OrderLine.order))
    )
    if date_from:
        q = q.filter(Order.created_at >= _day_start(date_from))
    if date_to:
        q = q.filter(Order.created_at <= _day_end(date_to))
    lines = q.all()

    product_ids = {ln.product_id for ln in lines if ln.product_id}
    products = {
        p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}

    buckets: dict[str, dict[str, float | int]] = {}
    for ln in lines:
        order = ln.order
        if order and order.status == "Sipariş İptali":
            continue
        prod = products.get(ln.product_id) if ln.product_id else None
        cat = (prod.category if prod and prod.category else None) or "Kategorisiz"
        b = buckets.setdefault(cat, {"qty": 0, "revenue": 0.0, "line_count": 0})
        b["qty"] = int(b["qty"]) + int(ln.quantity or 0)
        b["revenue"] = float(b["revenue"]) + _f(ln.line_total)
        b["line_count"] = int(b["line_count"]) + 1

    rows_out = [
        {
            "category": k,
            "line_count": int(v["line_count"]),
            "qty": int(v["qty"]),
            "revenue": float(v["revenue"]),
        }
        for k, v in sorted(buckets.items(), key=lambda x: -float(x[1]["revenue"]))
    ]
    summary = {
        "category_count": len(rows_out),
        "revenue": sum(r["revenue"] for r in rows_out),
        "qty": sum(r["qty"] for r in rows_out),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "assumptions": [
            "Kategori ürün kartından alınır; ürün yoksa 'Kategorisiz'.",
            "İptal sipariş satırları hariç.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "kategori_satis.csv",
            ["Kategori", "Satır", "Miktar", "Ciro"],
            [[r["category"], r["line_count"], r["qty"], r["revenue"]] for r in rows_out],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/product-buy-sell")
def product_buy_sell(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str | None = Query(default=None),
):
    """Per-product sold qty/revenue vs purchased qty/cost."""
    from app.models.order import OrderLine
    from app.models.supplier import PurchaseLine

    sq = (
        db.query(OrderLine)
        .join(Order, OrderLine.order_id == Order.id)
        .options(joinedload(OrderLine.order))
    )
    if date_from:
        sq = sq.filter(Order.created_at >= _day_start(date_from))
    if date_to:
        sq = sq.filter(Order.created_at <= _day_end(date_to))
    sales_map: dict[str, dict] = {}
    for ln in sq.all():
        if ln.order and ln.order.status == "Sipariş İptali":
            continue
        key = str(ln.product_id or f"d:{ln.description}")
        b = sales_map.setdefault(
            key,
            {
                "product_id": ln.product_id,
                "name": ln.description,
                "sold_qty": 0,
                "sold_amount": Decimal("0"),
            },
        )
        b["sold_qty"] += int(ln.quantity or 0)
        b["sold_amount"] += _dec(ln.line_total)

    pq = (
        db.query(PurchaseLine)
        .join(Purchase, PurchaseLine.purchase_id == Purchase.id)
        .options(joinedload(PurchaseLine.purchase))
    )
    if date_from:
        pq = pq.filter(Purchase.purchase_date >= date_from)
    if date_to:
        pq = pq.filter(Purchase.purchase_date <= date_to)
    buy_map: dict[str, dict] = {}
    for ln in pq.all():
        key = str(ln.product_id or f"d:{ln.description}")
        b = buy_map.setdefault(
            key,
            {
                "product_id": ln.product_id,
                "name": ln.description,
                "buy_qty": 0,
                "buy_amount": Decimal("0"),
            },
        )
        b["buy_qty"] += int(float(ln.quantity or 0))
        b["buy_amount"] += _dec(ln.unit_cost) * _dec(ln.quantity)

    keys = set(sales_map) | set(buy_map)
    pids = {int(k) for k in keys if k.isdigit()}
    products = {
        p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()
    } if pids else {}

    rows_out: list[dict] = []
    for key in keys:
        s = sales_map.get(key, {})
        b = buy_map.get(key, {})
        pid = s.get("product_id") or b.get("product_id")
        name = s.get("name") or b.get("name") or ""
        if pid and pid in products:
            name = products[pid].name
        sold_qty = int(s.get("sold_qty") or 0)
        buy_qty = int(b.get("buy_qty") or 0)
        sold_amt = _dec(s.get("sold_amount") or 0)
        buy_amt = _dec(b.get("buy_amount") or 0)
        rows_out.append(
            {
                "product_id": pid,
                "name": name,
                "sold_qty": sold_qty,
                "sold_amount": _f(sold_amt),
                "buy_qty": buy_qty,
                "buy_amount": _f(buy_amt),
                "net_qty": sold_qty - buy_qty,
                "gross_approx": _f(sold_amt - buy_amt),
            }
        )
    rows_out.sort(key=lambda r: r["sold_amount"], reverse=True)

    summary = {
        "row_count": len(rows_out),
        "sold_amount": sum(r["sold_amount"] for r in rows_out),
        "buy_amount": sum(r["buy_amount"] for r in rows_out),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "assumptions": [
            "Satış: sipariş satırları (iptal hariç).",
            "Alış: satın alma satırları.",
            "Eşleşme product_id; yoksa açıklama anahtarı.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "urun_alis_satis.csv",
            ["Ürün", "Satış adet", "Satış tutar", "Alış adet", "Alış tutar", "Net adet", "Fark"],
            [
                [
                    r["name"],
                    r["sold_qty"],
                    r["sold_amount"],
                    r["buy_qty"],
                    r["buy_amount"],
                    r["net_qty"],
                    r["gross_approx"],
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/stock-movements")
def stock_movements_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    format: str | None = Query(default=None),
):
    from app.models.product import StockMovement

    q = db.query(StockMovement).options(
        joinedload(StockMovement.product),
        joinedload(StockMovement.variant),
    )
    if date_from:
        q = q.filter(StockMovement.created_at >= _day_start(date_from))
    if date_to:
        q = q.filter(StockMovement.created_at <= _day_end(date_to))
    moves = q.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit).all()

    rows_out = []
    in_qty = 0
    out_qty = 0
    for m in moves:
        raw_qty = int(m.quantity or 0)
        direction = (m.direction or "").lower()
        signed = raw_qty if direction == "increase" else -abs(raw_qty)
        if signed >= 0:
            in_qty += abs(signed)
        else:
            out_qty += abs(signed)
        rows_out.append(
            {
                "id": m.id,
                "product_id": m.product_id,
                "product_name": m.product.name if m.product else None,
                "variant_name": m.variant.name if m.variant else None,
                "sku": (m.variant.sku if m.variant else None) or (m.product.sku if m.product else None),
                "quantity": signed,
                "direction": m.direction,
                "movement_type": m.reason or m.direction,
                "warehouse": m.warehouse,
                "note": sanitize_display_note(m.note) or None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
        )
    summary = {
        "count": len(rows_out),
        "in_qty": in_qty,
        "out_qty": out_qty,
        "limit": limit,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "assumptions": [
            "direction=increase → giriş; decrease → çıkış (miktar işaretli).",
            f"En fazla {limit} satır.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "stok_hareketleri.csv",
            ["id", "SKU", "Ürün", "Varyant", "Miktar", "Yön", "Neden", "Depo", "Tarih", "Not"],
            [
                [
                    r["id"],
                    r["sku"] or "",
                    r["product_name"] or "",
                    r["variant_name"] or "",
                    r["quantity"],
                    r["direction"] or "",
                    r["movement_type"] or "",
                    r["warehouse"] or "",
                    r["created_at"] or "",
                    r["note"] or "",
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/stock-idle")
def stock_idle_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    days: int = Query(default=90, ge=1, le=3650),
    format: str | None = Query(default=None),
):
    """Products with no stock movement in the last N days."""
    from datetime import timedelta
    from app.models.product import StockMovement

    cutoff = datetime.utcnow() - timedelta(days=days)
    last_rows = (
        db.query(StockMovement.product_id, func.max(StockMovement.created_at))
        .group_by(StockMovement.product_id)
        .all()
    )
    last_map = {r[0]: r[1] for r in last_rows}

    products = (
        db.query(Product)
        .options(joinedload(Product.variants))
        .filter(Product.is_active.is_(True))
        .order_by(Product.name)
        .all()
    )
    rows_out = []
    for p in products:
        last = last_map.get(p.id)
        if last and last >= cutoff:
            continue
        qty = int(p.stock_qty or 0)
        if p.variants:
            qty = sum(int(v.stock_qty or 0) for v in p.variants)
        rows_out.append(
            {
                "product_id": p.id,
                "sku": p.sku,
                "name": p.name,
                "category": p.category,
                "warehouse": p.warehouse,
                "qty": qty,
                "last_movement_at": last.isoformat() if last else None,
                "days_idle": (datetime.utcnow() - last).days if last else None,
            }
        )
    summary = {
        "count": len(rows_out),
        "days": days,
        "assumptions": [
            f"Son {days} günde stok hareketi olmayan aktif ürünler.",
            "Hiç hareketi olmayanlar da listelenir (last_movement_at=null).",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "hareket_gormeyen_urunler.csv",
            ["SKU", "Ürün", "Kategori", "Depo", "Miktar", "Son hareket", "Gün"],
            [
                [
                    r["sku"] or "",
                    r["name"],
                    r["category"] or "",
                    r["warehouse"] or "",
                    r["qty"],
                    r["last_movement_at"] or "",
                    r["days_idle"] if r["days_idle"] is not None else "",
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/stock-sales-coverage")
def stock_sales_coverage(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    days: int = Query(default=30, ge=1, le=365),
    format: str | None = Query(default=None),
):
    """Current stock vs sold qty in last N days."""
    from datetime import timedelta
    from app.models.order import OrderLine

    cutoff = datetime.utcnow() - timedelta(days=days)
    lines = (
        db.query(OrderLine)
        .join(Order, OrderLine.order_id == Order.id)
        .options(joinedload(OrderLine.order))
        .filter(Order.created_at >= cutoff)
        .all()
    )
    sold: dict[int, int] = {}
    for ln in lines:
        if not ln.product_id:
            continue
        if ln.order and ln.order.status == "Sipariş İptali":
            continue
        sold[ln.product_id] = sold.get(ln.product_id, 0) + int(ln.quantity or 0)

    products = (
        db.query(Product)
        .options(joinedload(Product.variants))
        .filter(Product.is_active.is_(True))
        .order_by(Product.name)
        .all()
    )
    rows_out = []
    short = 0
    for p in products:
        qty = int(p.stock_qty or 0)
        if p.variants:
            qty = sum(int(v.stock_qty or 0) for v in p.variants)
        s = sold.get(p.id, 0)
        if s == 0 and qty == 0:
            continue
        coverage = round(qty / s, 2) if s > 0 else None
        if s > qty:
            short += 1
        rows_out.append(
            {
                "product_id": p.id,
                "sku": p.sku,
                "name": p.name,
                "category": p.category,
                "stock_qty": qty,
                "sold_qty": s,
                "coverage_ratio": coverage,
                "shortfall": max(s - qty, 0),
            }
        )
    rows_out.sort(key=lambda r: r["sold_qty"], reverse=True)
    summary = {
        "count": len(rows_out),
        "days": days,
        "shortfall_count": short,
        "assumptions": [
            f"Satış: son {days} gün sipariş satırları (iptal hariç).",
            "Karşılama = stok / satış; 1.0 = stok satışı karşılıyor.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "stok_satis_karsilama.csv",
            ["SKU", "Ürün", "Stok", "Satış", "Oran", "Eksik"],
            [
                [
                    r["sku"] or "",
                    r["name"],
                    r["stock_qty"],
                    r["sold_qty"],
                    r["coverage_ratio"] if r["coverage_ratio"] is not None else "",
                    r["shortfall"],
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/account-balances")
def account_balances_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    format: str | None = Query(default=None),
):
    from app.models.finance import (
        BANK_IN_TYPES,
        CASH_IN_TYPES,
        BankAccount,
        BankMovement,
        CashMovement,
        CashRegister,
    )

    rows_out: list[dict] = []
    cash_total = Decimal("0")
    bank_total = Decimal("0")

    for reg in db.query(CashRegister).order_by(CashRegister.name).all():
        moves = db.query(CashMovement).filter(CashMovement.cash_register_id == reg.id).all()
        bal = _dec(getattr(reg, "opening_balance", 0) or 0)
        for m in moves:
            amt = _dec(m.amount)
            if m.movement_type in CASH_IN_TYPES:
                bal += amt
            else:
                bal -= amt
        cash_total += bal
        rows_out.append(
            {
                "kind": "cash",
                "id": reg.id,
                "name": reg.name,
                "currency": getattr(reg, "currency", None) or "TRY",
                "balance": _f(bal),
                "is_active": bool(getattr(reg, "is_active", True)),
            }
        )

    for acc in db.query(BankAccount).order_by(BankAccount.name).all():
        moves = db.query(BankMovement).filter(BankMovement.bank_account_id == acc.id).all()
        bal = _dec(getattr(acc, "opening_balance", 0) or 0)
        for m in moves:
            amt = _dec(m.amount)
            if m.movement_type in BANK_IN_TYPES:
                bal += amt
            else:
                bal -= amt
        bank_total += bal
        rows_out.append(
            {
                "kind": "bank",
                "id": acc.id,
                "name": acc.name,
                "currency": getattr(acc, "currency", None) or "TRY",
                "balance": _f(bal),
                "is_active": bool(getattr(acc, "is_active", True)),
                "account_type": getattr(acc, "account_type", None),
            }
        )

    summary = {
        "count": len(rows_out),
        "cash_total": _f(cash_total),
        "bank_total": _f(bank_total),
        "grand_total": _f(cash_total + bank_total),
        "assumptions": [
            "Bakiye = açılış + giriş − çıkış (kasa/banka tip listeleri).",
            "POS / kredi kartı hesapları banka tablosunda ise burada görünür.",
        ],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "hesap_bakiyeleri.csv",
            ["Tür", "Ad", "Para birimi", "Bakiye", "Aktif"],
            [
                [
                    "Kasa" if r["kind"] == "cash" else "Banka",
                    r["name"],
                    r["currency"],
                    r["balance"],
                    "Evet" if r["is_active"] else "Hayır",
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}


@router.get("/quotes")
def quotes_report(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str | None = Query(default=None),
):
    from app.models.quote import Quote

    q = db.query(Quote).options(joinedload(Quote.customer))
    if date_from:
        q = q.filter(Quote.created_at >= _day_start(date_from))
    if date_to:
        q = q.filter(Quote.created_at <= _day_end(date_to))
    quotes = q.order_by(Quote.created_at.desc()).all()
    rows_out = []
    total = Decimal("0")
    for qt in quotes:
        amt = _dec(getattr(qt, "total_amount", 0) or 0)
        total += amt
        rows_out.append(
            {
                "id": qt.id,
                "number": getattr(qt, "quote_number", None) or getattr(qt, "number", None),
                "customer_name": qt.customer.name if qt.customer else None,
                "status": qt.status,
                "total_amount": _f(amt),
                "created_at": qt.created_at.isoformat() if qt.created_at else None,
                "valid_until": qt.valid_until.isoformat()
                if getattr(qt, "valid_until", None)
                else None,
            }
        )
    summary = {
        "count": len(rows_out),
        "total": _f(total),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "assumptions": ["Teklif tutarları quote.total_amount alanından."],
    }
    if _wants_csv(request, format):
        return _csv_response(
            "teklifler_raporu.csv",
            ["No", "Müşteri", "Durum", "Tutar", "Oluşturma", "Geçerlilik"],
            [
                [
                    r["number"] or "",
                    r["customer_name"] or "",
                    r["status"] or "",
                    r["total_amount"],
                    r["created_at"] or "",
                    r["valid_until"] or "",
                ]
                for r in rows_out
            ],
        )
    return {"summary": summary, "rows": rows_out}
