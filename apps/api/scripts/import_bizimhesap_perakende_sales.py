#!/usr/bin/env python3
"""Materialize BH Perakende Satışlar into cari sale(+payment) movements.

Prefers GetSalesReport export (tmp/bizimhesap/sales/sales_all.json) for product
line detail. Falls back to cash/bank GetCashTrx rows with Cari=Perakende.

Idempotent note prefixes:
  BH_IMPORT:BH-RETAIL:     sale
  BH_IMPORT:BH-RETAIL-PAY: payment (same amount → balance 0)

Customer: code=BH:PERAKENDE name=Perakende Satışlar

Sep 2026 smoke: perakende sales + other cari sales ≈ BH Eylül Cirosu 14.153,44.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))
os.chdir(API_ROOT)

# DATABASE_URL must be set before importing app.db.session
os.environ.setdefault("DATABASE_URL", "sqlite:///./baykus.db")

from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker

from app.models.customer import CariMovement, Customer
from app.models.finance import BankMovement, CashMovement

CUSTOMER_CODE = "BH:PERAKENDE"
CUSTOMER_NAME = "Perakende Satışlar"
SALE_PREFIX = "BH_IMPORT:BH-RETAIL:"
PAY_PREFIX = "BH_IMPORT:BH-RETAIL-PAY:"
TRX_RE = re.compile(r"BH_IMPORT:BH-TRX-([A-Fa-f0-9]+)", re.I)
DEFAULT_SALES = Path("../../tmp/bizimhesap/sales/sales_all.json")
BH_EYLUL_TARGET = Decimal("14153.44")


def money(val) -> Decimal:
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val.quantize(Decimal("0.01"))
    s = str(val).strip().replace("TL", "").strip()
    if not s or s == "-":
        return Decimal("0.00")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def parse_dt(val) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    s = str(val).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y %H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt).date()
        except ValueError:
            continue
    if len(s) >= 10 and s[4] == "-":
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None
    return None


def resolve_sqlite_path() -> Path:
    url = os.environ.get("DATABASE_URL") or "sqlite:///./baykus.db"
    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///") :]
        p = Path(raw)
        if not p.is_absolute():
            p = (API_ROOT / p).resolve()
        return p
    return API_ROOT / "baykus.db"


def backup_db(db_path: Path) -> Path | None:
    if not db_path.is_file():
        return None
    bak_dir = API_ROOT / "backups"
    bak_dir.mkdir(exist_ok=True)
    dest = bak_dir / f"baykus_pre_bh_perakende_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    shutil.copy2(db_path, dest)
    return dest


def rows_from_sales_json(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for i, r in enumerate(data):
        if not isinstance(r, dict):
            continue
        identity = (r.get("DsIdentity") or "").strip()
        if identity != CUSTOMER_NAME:
            continue
        amt = money(r.get("MtNet") if r.get("MtNet") not in (None, "") else r.get("MtTotal"))
        if amt <= 0:
            continue
        dt = parse_dt(r.get("DtTransaction"))
        if not dt:
            continue
        doc = (r.get("DsDocGuid") or "").upper() or f"ROW{i}"
        prod = (r.get("DsProduct") or "").strip()
        qty = r.get("MtQuantity") or r.get("DsQuantity") or ""
        unit = r.get("DsUnit") or ""
        price = r.get("MtUnitPrice")
        barcode = r.get("DsBarcode") or ""
        key = f"{doc}:{r.get('IdProduct') or i}:{i}"
        kalem = f"{prod} x{qty} {unit} @{price}={amt}".strip()
        out.append(
            {
                "key": key,
                "amount": amt,
                "date": dt,
                "source": "getsalesreport",
                "aciklama": (r.get("DsNote") or r.get("DsDetailNote") or "").strip(),
                "kalem": kalem,
                "doc": doc,
                "barcode": barcode,
                "product": prod,
            }
        )
    out.sort(key=lambda x: (x["date"], x["key"]))
    return out


def rows_from_ledger(db) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for source, moves in (
        ("cash", db.query(CashMovement).filter(CashMovement.note.isnot(None)).all()),
        ("bank", db.query(BankMovement).filter(BankMovement.note.isnot(None)).all()),
    ):
        for m in moves:
            note = m.note or ""
            if "Perakende Satışlar" not in note and "Perakende Satislar" not in note:
                continue
            m_trx = TRX_RE.search(note)
            if not m_trx:
                continue
            guid = m_trx.group(1).upper()
            if guid in seen:
                continue
            mtype = (m.movement_type or "").lower()
            if mtype in ("odeme", "withdrawal", "gider", "transfer_out", "transfer_in", "fee"):
                continue
            amt = money(m.amount)
            if amt <= 0:
                continue
            seen.add(guid)
            # free text after pipes
            free = []
            for part in note.split("|"):
                p = part.strip()
                if not p or p.upper().startswith("BH_IMPORT") or "=" in p:
                    continue
                free.append(p)
            rows.append(
                {
                    "key": guid,
                    "amount": amt,
                    "date": m.movement_date,
                    "source": f"getcashtrx-{source}",
                    "aciklama": " | ".join(free),
                    "kalem": "",
                    "doc": guid,
                    "barcode": "",
                    "product": "",
                }
            )
    rows.sort(key=lambda x: (x["date"] or date.min, x["key"]))
    return rows


def ensure_customer(db) -> Customer:
    c = db.query(Customer).filter(Customer.code == CUSTOMER_CODE).one_or_none()
    if c:
        c.name = CUSTOMER_NAME
        return c
    c = db.query(Customer).filter(Customer.name == CUSTOMER_NAME).one_or_none()
    if c:
        c.code = CUSTOMER_CODE
        return c
    c = Customer(
        code=CUSTOMER_CODE,
        name=CUSTOMER_NAME,
        company=CUSTOMER_NAME,
        notes="BH_IMPORT: Perakende Satışlar group (GetSalesReport / GetCashTrx)",
        is_active=True,
        opening_balance=Decimal("0"),
    )
    db.add(c)
    db.flush()
    return c


def wipe_prior(db, customer_id: int) -> int:
    q = db.query(CariMovement).filter(
        CariMovement.customer_id == customer_id,
        or_(
            CariMovement.note.like(f"{SALE_PREFIX}%"),
            CariMovement.note.like(f"{PAY_PREFIX}%"),
        ),
    )
    n = q.count()
    q.delete(synchronize_session=False)
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sales-json", type=Path, default=DEFAULT_SALES)
    ap.add_argument("--from-ledger", action="store_true", help="Force GetCashTrx path")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-backup", action="store_true")
    args = ap.parse_args()

    db_path = resolve_sqlite_path()
    print(f"DB: {db_path}", flush=True)
    url = os.environ.get("DATABASE_URL") or f"sqlite:///{db_path}"
    engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
    Session = sessionmaker(bind=engine)
    db = Session()

    sales_path = args.sales_json
    if not sales_path.is_absolute():
        sales_path = (API_ROOT / sales_path).resolve()

    try:
        if args.from_ledger:
            rows = rows_from_ledger(db)
            src_label = "ledger"
        else:
            rows = rows_from_sales_json(sales_path)
            src_label = f"sales_json:{sales_path}"
            if not rows:
                rows = rows_from_ledger(db)
                src_label = "ledger-fallback"
        print(f"  source={src_label} rows={len(rows)}", flush=True)
        sale_sum = sum((r["amount"] for r in rows), Decimal("0"))
        sep_sum = sum(
            (r["amount"] for r in rows if r["date"] and r["date"].year == 2026 and r["date"].month == 9),
            Decimal("0"),
        )
        print(f"  sale_sum={sale_sum} sep_2026={sep_sum}", flush=True)

        if args.dry_run:
            print({"dry_run": True, "rows": len(rows), "sale_sum": float(sale_sum), "sep_2026": float(sep_sum)})
            return 0

        if not args.skip_backup:
            bak = backup_db(db_path)
            if bak:
                print(f"  backup -> {bak}", flush=True)

        customer = ensure_customer(db)
        deleted = wipe_prior(db, customer.id)
        for r in rows:
            sale_note = (
                f"{SALE_PREFIX}{r['key']} | Hareket=Satış | Cari={CUSTOMER_NAME} | "
                f"Belge={r['doc']} | Kalem={r['kalem']} | {r['aciklama']} | Kaynak={r['source']}"
            )
            pay_note = (
                f"{PAY_PREFIX}{r['key']} | Hareket=Tahsilat | Cari={CUSTOMER_NAME} | "
                f"Belge={r['doc']} | Kaynak={r['source']}"
            )
            db.add(
                CariMovement(
                    customer_id=customer.id,
                    movement_type="sale",
                    debit=r["amount"],
                    credit=Decimal("0"),
                    movement_date=r["date"],
                    note=sale_note[:2000],
                )
            )
            db.add(
                CariMovement(
                    customer_id=customer.id,
                    movement_type="payment",
                    debit=Decimal("0"),
                    credit=r["amount"],
                    movement_date=r["date"],
                    note=pay_note[:2000],
                )
            )
        db.commit()

        sep_retail = (
            db.query(CariMovement)
            .filter(
                CariMovement.customer_id == customer.id,
                CariMovement.movement_type == "sale",
                CariMovement.movement_date >= date(2026, 9, 1),
                CariMovement.movement_date < date(2026, 10, 1),
            )
            .all()
        )
        sep_retail_sum = sum((Decimal(str(m.debit)) for m in sep_retail), Decimal("0"))
        sep_other = (
            db.query(CariMovement)
            .filter(
                CariMovement.customer_id != customer.id,
                CariMovement.movement_type == "sale",
                CariMovement.movement_date >= date(2026, 9, 1),
                CariMovement.movement_date < date(2026, 10, 1),
            )
            .all()
        )
        sep_other_sum = sum((Decimal(str(m.debit)) for m in sep_other), Decimal("0"))
        total = sep_retail_sum + sep_other_sum
        stats = {
            "deleted_prior": deleted,
            "sale_rows": len(rows),
            "sale_sum": float(sale_sum),
            "customer_id": customer.id,
            "source": src_label,
            "sep_retail": float(sep_retail_sum),
            "sep_other_cari": float(sep_other_sum),
            "sep_total_sales": float(total),
            "bh_eylul_ciro_target": float(BH_EYLUL_TARGET),
            "sep_match": abs(total - BH_EYLUL_TARGET) < Decimal("0.02"),
        }
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return 0 if stats["sep_match"] else 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
