"""Reports module — real aggregates from orders, stock, cari, suppliers, finance."""

from __future__ import annotations

import csv
import io
from calendar import monthrange
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import func
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
from app.models.product import Product
from app.models.supplier import Purchase, Supplier, SupplierMovement
from app.models.user import User

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
                "description": "Siparişler: adet, ciro, durum dağılımı (tarih aralığı)",
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
                "title": "Kar özeti (basit)",
                "path": "/api/reports/profit",
                "href": "/reports/profit",
                "description": "Ay ciro vs onaylı satın alma maliyeti — basit yaklaşım",
            },
        ]
    }


# ── Shared sales query ─────────────────────────────────────────────────────


def _sales_data(
    db: Session,
    date_from: date | None,
    date_to: date | None,
    status: str | None,
) -> tuple[dict, list[dict]]:
    q = db.query(Order).options(joinedload(Order.customer), joinedload(Order.payments))
    if date_from:
        q = q.filter(Order.created_at >= _day_start(date_from))
    if date_to:
        q = q.filter(Order.created_at <= _day_end(date_to))
    if status:
        q = q.filter(Order.status == status)

    orders = q.order_by(Order.created_at.desc()).all()

    rows_out: list[dict] = []
    total_revenue = Decimal("0")
    total_remaining = Decimal("0")
    cancelled_count = 0
    by_status: dict[str, dict[str, float | int]] = {
        s: {"count": 0, "revenue": 0.0} for s in ORDER_STATUSES
    }

    for o in orders:
        amt = _dec(o.total_amount)
        rem = _remaining(o)
        paid = _paid_amount(o)
        if o.status == "Sipariş İptali":
            cancelled_count += 1
        else:
            total_revenue += amt
            total_remaining += rem
        st = o.status or "?"
        bucket = by_status.setdefault(st, {"count": 0, "revenue": 0.0})
        bucket["count"] = int(bucket["count"]) + 1
        if st != "Sipariş İptali":
            bucket["revenue"] = float(bucket["revenue"]) + _f(amt)
        rows_out.append(
            {
                "id": o.id,
                "order_number": o.order_number,
                "customer_id": o.customer_id,
                "customer_name": o.customer.name if o.customer else None,
                "status": o.status,
                "total_amount": _f(amt),
                "paid_amount": _f(paid if paid > 0 else o.deposit_amount),
                "remaining_amount": _f(rem),
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "due_date": o.due_date.isoformat() if o.due_date else None,
            }
        )

    summary = {
        "order_count": len(orders),
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
            "Sipariş No",
            "Müşteri",
            "Durum",
            "Tutar",
            "Ödenen",
            "Kalan",
            "Oluşturma",
            "Termin",
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
                r["due_date"] or "",
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
        f"<td>{(r['created_at'] or '')[:10]}</td></tr>"
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
· Aralık: {summary.get('date_from') or '—'} → {summary.get('date_to') or '—'}</div>
<table><thead><tr><th>Sipariş</th><th>Müşteri</th><th>Durum</th><th>Tutar</th><th>Tarih</th></tr></thead>
<tbody>{trs or '<tr><td colspan="5">Kayıt yok</td></tr>'}</tbody></table>
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
):
    products = (
        db.query(Product)
        .options(joinedload(Product.variants))
        .order_by(Product.name)
        .all()
    )

    rows_out: list[dict] = []
    total_qty = 0
    total_value_cost = Decimal("0")
    total_value_sale = Decimal("0")
    critical_count = 0

    for p in products:
        threshold = p.critical_stock_threshold or 0
        unit_cost = _dec(p.cost) if _dec(p.cost) > 0 else _dec(p.purchase_price)
        unit_sale = _dec(p.base_price)

        if p.variants:
            for v in p.variants:
                qty = int(v.stock_qty or 0)
                is_crit = qty < threshold
                v_sale = _dec(v.price) if _dec(v.price) > 0 else unit_sale
                val_cost = unit_cost * qty
                val_sale = v_sale * qty
                total_qty += qty
                total_value_cost += val_cost
                total_value_sale += val_sale
                if is_crit:
                    critical_count += 1
                if critical_only and not is_crit:
                    continue
                value = val_cost if value_basis == "cost" else val_sale
                rows_out.append(
                    {
                        "product_id": p.id,
                        "sku": v.sku,
                        "name": p.name,
                        "variant_id": v.id,
                        "variant_name": v.name,
                        "category": p.category,
                        "warehouse": p.warehouse,
                        "qty": qty,
                        "threshold": threshold,
                        "is_critical": is_crit,
                        "unit_cost": _f(unit_cost),
                        "unit_sale": _f(v_sale),
                        "value": _f(value),
                        "value_basis": value_basis,
                        "product_type": p.product_type,
                        "is_active": bool(p.is_active),
                    }
                )
        else:
            qty = int(p.stock_qty or 0)
            is_crit = qty < threshold
            val_cost = unit_cost * qty
            val_sale = unit_sale * qty
            total_qty += qty
            total_value_cost += val_cost
            total_value_sale += val_sale
            if is_crit:
                critical_count += 1
            if critical_only and not is_crit:
                continue
            value = val_cost if value_basis == "cost" else val_sale
            rows_out.append(
                {
                    "product_id": p.id,
                    "sku": p.sku,
                    "name": p.name,
                    "variant_id": None,
                    "variant_name": None,
                    "category": p.category,
                    "warehouse": p.warehouse,
                    "qty": qty,
                    "threshold": threshold,
                    "is_critical": is_crit,
                    "unit_cost": _f(unit_cost),
                    "unit_sale": _f(unit_sale),
                    "value": _f(value),
                    "value_basis": value_basis,
                    "product_type": p.product_type,
                    "is_active": bool(p.is_active),
                }
            )

    summary = {
        "row_count": len(rows_out),
        "total_qty": total_qty if not critical_only else sum(r["qty"] for r in rows_out),
        "total_value_cost": _f(total_value_cost),
        "total_value_sale": _f(total_value_sale),
        "total_value": _f(total_value_cost if value_basis == "cost" else total_value_sale),
        "critical_count": critical_count,
        "value_basis": value_basis,
        "critical_only": critical_only,
        "assumptions": [
            "Maliyet birimi: product.cost; yoksa purchase_price.",
            "Satış birimi: varyant.price (varsa) yoksa product.base_price.",
            "Kritik: qty < critical_stock_threshold.",
            "Değer = miktar × birim (seçilen baz).",
        ],
    }

    if _wants_csv(request, format):
        headers = [
            "SKU",
            "Ürün",
            "Varyant",
            "Kategori",
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

    return {"summary": summary, "rows": rows_out}


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
                    "note": m.note,
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
                    "note": m.note,
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
