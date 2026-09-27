#!/usr/bin/env python3
"""One-shot wipe of seed/demo commercial data — keep BizimHesap (BH:) imports.

Deletes:
  - SIP-2026-* orders (+ lines, payments, status history, design files)
  - TKL-2026-* quotes (+ lines)
  - Orphan seed CRM fluff: campaigns, special_days, dtf demo scenarios,
    directory_contacts, seed documents, cost_items, seed price lists
  - Leftover M-00x / T-00x parties and classic demo SKUs if still present
  - Seed purchases SA-{year}-* without BH link; seed tasks titled Demo/Seed

Does NOT delete:
  - BH: / BH_IMPORT customers, suppliers, products, variants, stock,
    cari/supplier movements, expenses, loans, assets, bank/cash ledgers

Usage (from apps/api, venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/wipe_demo_data.py
  python scripts/wipe_demo_data.py --dry-run
  python -m app.scripts.wipe_demo_data
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

DEMO_ORDER_RE = re.compile(r"^SIP-2026-", re.I)
DEMO_QUOTE_RE = re.compile(r"^TKL-2026-", re.I)
DEMO_CUSTOMER_RE = re.compile(r"^M-\d+$", re.I)
DEMO_SUPPLIER_RE = re.compile(r"^T-\d+$", re.I)
DEMO_PURCHASE_RE = re.compile(r"^SA-\d{4}-\d+$", re.I)
DEMO_SKUS = {
    "TSH-001",
    "HDD-001",
    "CP-001",
    "BG-001",
    "POL-001",
    "SNAP-001",
    "MOUSE-001",
    "HOOD-KID",
    "SVC-DTF",
    "SVC-NAK",
    "APR-001",
    "BOTTLE-001",
}
BH_CODE_PREFIX = "BH:"
BH_NOTE_PREFIX = "BH_IMPORT"


def _is_bh_code(code: str | None) -> bool:
    return bool(code) and str(code).startswith(BH_CODE_PREFIX)


def _is_bh_note(note: str | None) -> bool:
    return bool(note) and BH_NOTE_PREFIX in str(note)


def wipe(db, *, dry_run: bool) -> dict[str, int]:
    from sqlalchemy import or_

    from app.models import (
        Campaign,
        CostItem,
        Customer,
        DirectoryContact,
        Document,
        DtfScenario,
        Order,
        OrderDesignFile,
        OrderLine,
        OrderStatusHistory,
        Payment,
        PriceList,
        PriceListItem,
        Product,
        ProductVariant,
        Purchase,
        PurchaseLine,
        Quote,
        QuoteLine,
        SpecialDay,
        Supplier,
        SupplierMovement,
        CariMovement,
        StockMovement,
    )
    from app.models import Task

    stats: dict[str, int] = {}

    def bump(key: str, n: int) -> None:
        stats[key] = stats.get(key, 0) + n

    # ── Orders SIP-2026-* ──────────────────────────────────────────────────
    demo_orders = (
        db.query(Order)
        .filter(Order.order_number.like("SIP-2026-%"))
        .all()
    )
    order_ids = [o.id for o in demo_orders]
    if order_ids:
        n = (
            db.query(Payment)
            .filter(Payment.order_id.in_(order_ids))
            .delete(synchronize_session=False)
        )
        bump("payments", n)
        n = (
            db.query(OrderLine)
            .filter(OrderLine.order_id.in_(order_ids))
            .delete(synchronize_session=False)
        )
        bump("order_lines", n)
        n = (
            db.query(OrderStatusHistory)
            .filter(OrderStatusHistory.order_id.in_(order_ids))
            .delete(synchronize_session=False)
        )
        bump("order_status_history", n)
        n = (
            db.query(OrderDesignFile)
            .filter(OrderDesignFile.order_id.in_(order_ids))
            .delete(synchronize_session=False)
        )
        bump("order_design_files", n)
        # Detach cari rows that still point at demo orders (keep the BH movement)
        n = (
            db.query(CariMovement)
            .filter(CariMovement.order_id.in_(order_ids))
            .update({CariMovement.order_id: None}, synchronize_session=False)
        )
        bump("cari_order_unlink", n)
        n = (
            db.query(Order)
            .filter(Order.id.in_(order_ids))
            .delete(synchronize_session=False)
        )
        bump("orders", n)

    # ── Quotes TKL-2026-* ──────────────────────────────────────────────────
    demo_quotes = (
        db.query(Quote)
        .filter(Quote.quote_number.like("TKL-2026-%"))
        .all()
    )
    quote_ids = [q.id for q in demo_quotes]
    if quote_ids:
        n = (
            db.query(QuoteLine)
            .filter(QuoteLine.quote_id.in_(quote_ids))
            .delete(synchronize_session=False)
        )
        bump("quote_lines", n)
        n = (
            db.query(Quote)
            .filter(Quote.id.in_(quote_ids))
            .delete(synchronize_session=False)
        )
        bump("quotes", n)

    # ── Seed purchases SA-YYYY-* without BH note ───────────────────────────
    purchases = db.query(Purchase).all()
    pur_ids = [
        p.id
        for p in purchases
        if p.purchase_number
        and DEMO_PURCHASE_RE.match(p.purchase_number)
        and not _is_bh_note(getattr(p, "notes", None))
    ]
    if pur_ids:
        n = (
            db.query(SupplierMovement)
            .filter(SupplierMovement.purchase_id.in_(pur_ids))
            .delete(synchronize_session=False)
        )
        bump("supplier_movements_purchase", n)
        n = (
            db.query(PurchaseLine)
            .filter(PurchaseLine.purchase_id.in_(pur_ids))
            .delete(synchronize_session=False)
        )
        bump("purchase_lines", n)
        n = (
            db.query(Purchase)
            .filter(Purchase.id.in_(pur_ids))
            .delete(synchronize_session=False)
        )
        bump("purchases", n)

    # ── Leftover M-00x / T-00x parties (non-BH) ────────────────────────────
    demo_cust = [
        c
        for c in db.query(Customer).all()
        if c.code and DEMO_CUSTOMER_RE.match(c.code) and not _is_bh_code(c.code)
    ]
    cust_ids = [c.id for c in demo_cust]
    if cust_ids:
        n = (
            db.query(CariMovement)
            .filter(CariMovement.customer_id.in_(cust_ids))
            .delete(synchronize_session=False)
        )
        bump("cari_movements_demo_cust", n)
        # Null FKs on leftover orders/quotes that somehow reference them
        db.query(Order).filter(Order.customer_id.in_(cust_ids)).update(
            {Order.customer_id: None}, synchronize_session=False
        )
        db.query(Quote).filter(Quote.customer_id.in_(cust_ids)).update(
            {Quote.customer_id: None}, synchronize_session=False
        )
        n = (
            db.query(Customer)
            .filter(Customer.id.in_(cust_ids))
            .delete(synchronize_session=False)
        )
        bump("customers_M00x", n)

    demo_sup = [
        s
        for s in db.query(Supplier).all()
        if s.code and DEMO_SUPPLIER_RE.match(s.code) and not _is_bh_code(s.code)
    ]
    sup_ids = [s.id for s in demo_sup]
    if sup_ids:
        n = (
            db.query(SupplierMovement)
            .filter(SupplierMovement.supplier_id.in_(sup_ids))
            .delete(synchronize_session=False)
        )
        bump("supplier_movements_demo", n)
        n = (
            db.query(Supplier)
            .filter(Supplier.id.in_(sup_ids))
            .delete(synchronize_session=False)
        )
        bump("suppliers_T00x", n)

    # ── Classic demo SKUs (only if not BH-coded) ───────────────────────────
    demo_prods = [
        p
        for p in db.query(Product).filter(Product.sku.in_(DEMO_SKUS)).all()
        if not _is_bh_code(p.sku)
    ]
    prod_ids = [p.id for p in demo_prods]
    if prod_ids:
        n = (
            db.query(StockMovement)
            .filter(StockMovement.product_id.in_(prod_ids))
            .delete(synchronize_session=False)
        )
        bump("stock_movements_demo_sku", n)
        n = (
            db.query(ProductVariant)
            .filter(ProductVariant.product_id.in_(prod_ids))
            .delete(synchronize_session=False)
        )
        bump("product_variants_demo", n)
        n = (
            db.query(Product)
            .filter(Product.id.in_(prod_ids))
            .delete(synchronize_session=False)
        )
        bump("products_demo_sku", n)

    # ── Seed CRM / misc sample rows (no BH tags exist on these tables) ─────
    # Campaigns — all current rows are seed
    n = db.query(Campaign).delete(synchronize_session=False)
    bump("campaigns", n)

    # Special days — seed names / demo events
    n = db.query(SpecialDay).delete(synchronize_session=False)
    bump("special_days", n)

    # DTF scenarios marked demo / Seed
    n = (
        db.query(DtfScenario)
        .filter(
            or_(
                DtfScenario.name.ilike("%demo%"),
                DtfScenario.note.ilike("%seed%"),
                DtfScenario.note.ilike("%demo%"),
            )
        )
        .delete(synchronize_session=False)
    )
    bump("dtf_scenarios", n)

    # Directory seed contacts
    n = db.query(DirectoryContact).delete(synchronize_session=False)
    bump("directory_contacts", n)

    # Seed documents
    n = (
        db.query(Document)
        .filter(
            or_(
                Document.notes.ilike("%seed%"),
                Document.notes.ilike("%demo%"),
                Document.title.in_(
                    ["Sözleşme Şablonu", "Kargo Anlaşması", "Fiyat Politikası"]
                ),
            )
        )
        .delete(synchronize_session=False)
    )
    bump("documents", n)

    # Cost items — seed catalog (not BH masraf)
    n = db.query(CostItem).delete(synchronize_session=False)
    bump("cost_items", n)

    # Seed price lists
    seed_pls = (
        db.query(PriceList)
        .filter(
            or_(
                PriceList.name.in_(["Perakende 2026", "Toptan Kurumsal"]),
                PriceList.description.ilike("%seed%"),
                PriceList.description.ilike("%demo%"),
            )
        )
        .all()
    )
    pl_ids = [p.id for p in seed_pls]
    if pl_ids:
        n = (
            db.query(PriceListItem)
            .filter(PriceListItem.price_list_id.in_(pl_ids))
            .delete(synchronize_session=False)
        )
        bump("price_list_items", n)
        n = (
            db.query(PriceList)
            .filter(PriceList.id.in_(pl_ids))
            .delete(synchronize_session=False)
        )
        bump("price_lists", n)

    # Seed / demo tasks
    n = (
        db.query(Task)
        .filter(
            or_(
                Task.title.ilike("%demo%"),
                Task.title.ilike("%seed%"),
                Task.note.ilike("%demo%"),
                Task.note.ilike("%seed%"),
                Task.order_number.like("SIP-2026-%"),
            )
        )
        .delete(synchronize_session=False)
    )
    bump("tasks", n)

    if dry_run:
        db.rollback()
    else:
        db.commit()

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Wipe seed/demo data; keep BH imports")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count deletions without committing",
    )
    args = parser.parse_args()

    from app.db.session import SessionLocal
    import app.models  # noqa: F401 — register metadata

    db = SessionLocal()
    try:
        stats = wipe(db, dry_run=args.dry_run)
    finally:
        db.close()

    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(f"wipe_demo_data [{mode}]")
    if not stats:
        print("  (nothing to delete)")
    else:
        for k, v in sorted(stats.items()):
            print(f"  {k}: {v}")
    print("BH customers/suppliers/products/movements/expenses/loans/assets preserved.")


if __name__ == "__main__":
    main()
