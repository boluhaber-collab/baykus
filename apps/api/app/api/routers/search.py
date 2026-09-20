"""Global Akıllı Arama — customers, orders, products, suppliers, quotes."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.customer import Customer
from app.models.order import Order
from app.models.product import Product
from app.models.quote import Quote
from app.models.supplier import Supplier
from app.models.user import User

router = APIRouter(prefix="/search", tags=["search"])

READ_ROLES = ("admin", "satış", "muhasebe", "üretim", "depo")


def _score(haystack: str, q: str, q_digits: str) -> int:
    h = (haystack or "").casefold()
    if not h:
        return 0
    score = 0
    if q and q in h:
        score += 40
    if q and h.startswith(q):
        score += 25
    for part in q.split():
        if part and part in h:
            score += 8
    if q_digits and len(q_digits) >= 3:
        digits = "".join(c for c in h if c.isdigit())
        if q_digits in digits:
            score += 45
    return score


@router.get("")
def global_search(
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=40, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    """Desktop akilli_arama_kayitlari breadth — Müşteri/Sipariş/Teklif/Ürün/Tedarikçi."""
    raw = (q or "").strip()
    if len(raw) < 2 and len("".join(c for c in raw if c.isdigit())) < 3:
        return {"query": raw, "count": 0, "results": []}

    qn = raw.casefold()
    q_digits = "".join(c for c in raw if c.isdigit())
    results: list[dict] = []
    seen: set[tuple] = set()

    def add(tur: str, no_kod: str, ad: str, iliski: str, detay: str, href: str, score: int) -> None:
        key = (tur, no_kod, ad, iliski)
        if key in seen or score <= 0:
            return
        seen.add(key)
        results.append(
            {
                "tur": tur,
                "no_kod": no_kod,
                "ad": ad,
                "iliski": iliski,
                "detay": detay,
                "href": href,
                "score": score,
            }
        )

    # Customers
    for c in db.query(Customer).order_by(Customer.id.desc()).limit(800).all():
        blob = " ".join(
            filter(
                None,
                [c.name, c.company, c.phone, c.code, c.email, c.city],
            )
        )
        sc = _score(blob, qn, q_digits)
        if sc:
            add(
                "Müşteri",
                c.code or f"#{c.id}",
                c.name,
                c.phone or "",
                c.company or c.city or "",
                f"/customers/{c.id}",
                sc + 5,
            )

    # Suppliers
    for s in db.query(Supplier).order_by(Supplier.id.desc()).limit(500).all():
        blob = " ".join(filter(None, [s.name, s.company, s.phone, s.code, s.email, s.city]))
        sc = _score(blob, qn, q_digits)
        if sc:
            add(
                "Tedarikçi",
                s.code or f"#{s.id}",
                s.name,
                s.phone or "",
                s.company or s.city or "",
                f"/suppliers/{s.id}",
                sc + 3,
            )

    # Products
    for p in db.query(Product).order_by(Product.id.desc()).limit(800).all():
        blob = " ".join(filter(None, [p.name, p.sku, p.category, p.brand]))
        sc = _score(blob, qn, q_digits)
        if sc:
            add(
                "Ürün",
                p.sku or f"#{p.id}",
                p.name,
                p.category or "",
                f"Stok {p.stock_qty or 0} · {float(p.base_price or 0):.2f} ₺",
                f"/products/{p.id}",
                sc + 4,
            )

    # Orders
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer))
        .order_by(Order.id.desc())
        .limit(600)
        .all()
    )
    for o in orders:
        cust = o.customer.name if o.customer else ""
        phone = o.customer.phone if o.customer else ""
        blob = " ".join(
            filter(
                None,
                [o.order_number, cust, phone, o.status, o.channel],
            )
        )
        sc = _score(blob, qn, q_digits)
        if sc:
            add(
                "Sipariş",
                o.order_number or f"#{o.id}",
                cust or "Perakende",
                phone or "",
                f"{o.status} · {float(o.total_amount or 0):.2f} ₺",
                f"/orders/{o.id}",
                sc + 6,
            )

    # Quotes
    quotes = (
        db.query(Quote)
        .options(joinedload(Quote.customer))
        .order_by(Quote.id.desc())
        .limit(400)
        .all()
    )
    for t in quotes:
        cust = t.customer.name if t.customer else ""
        phone = t.customer.phone if t.customer else ""
        blob = " ".join(filter(None, [t.quote_number, cust, phone, t.status]))
        sc = _score(blob, qn, q_digits)
        if sc:
            add(
                "Teklif",
                t.quote_number or f"#{t.id}",
                cust or "—",
                phone or "",
                f"{t.status} · {float(t.total_amount or 0):.2f} ₺",
                f"/quotes/{t.id}",
                sc + 2,
            )

    results.sort(key=lambda r: (-r["score"], r["tur"], r["ad"]))
    trimmed = results[:limit]
    for r in trimmed:
        r.pop("score", None)
    return {"query": raw, "count": len(trimmed), "results": trimmed}
