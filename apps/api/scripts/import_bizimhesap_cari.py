#!/usr/bin/env python3
"""BizimHesap cari (müşteri/tedarikçi list + Detaylı Ekstre PDF) → Baykuş SQLite.

Usage (from apps/api, with venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/import_bizimhesap_cari.py
  python scripts/import_bizimhesap_cari.py --ekstre-dir ../../tmp/bizimhesap/ekstre
  python -m app.scripts.import_bizimhesap_cari

Wipe / upsert policy (see docs/BIZIMHESAP_IMPORT.md):
  - BACKUP baykus.db first
  - Upsert Customer/Supplier by code=BH:{guid} or normalized name
  - Remove prior BH_IMPORT-tagged cari/supplier movements (idempotent re-run)
  - Optionally clear seed demo parties (M-00x / T-00x) that are not BH-tagged
  - Do NOT create purchase/order stubs — movements + opening_balance only
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from app.utils.html_text import decode_html_entities

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

BH_NOTE_PREFIX = "BH_IMPORT:"
BH_CODE_PREFIX = "BH:"
DEMO_CUSTOMER_RE = re.compile(r"^M-\d+$", re.I)
DEMO_SUPPLIER_RE = re.compile(r"^T-\d+$", re.I)

DATE_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})")
HAREKET_RE = re.compile(
    r"(Satış|Tahsilat|Alış|Ödeme|Alacak\s*Fişi|Borç\s*Fişi|Alacak|Borç|"
    r"Virman|Devir|İade|Açılış|Gider Pusulası|Mahsup|Kur Farkı)"
)
LINE_RE = re.compile(
    rf"^\s*{DATE_RE.pattern}\s+{DATE_RE.pattern}\s+{HAREKET_RE.pattern}\b(.*)$"
)
MONEY_RE = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}")
GUID_RE = re.compile(r"([0-9A-Fa-f]{32})")
SAFE_PRINT_REPLACEMENTS = str.maketrans(
    {
        "İ": "I",
        "ı": "i",
        "Ş": "S",
        "ş": "s",
        "Ğ": "G",
        "ğ": "g",
        "Ü": "U",
        "ü": "u",
        "Ö": "O",
        "ö": "o",
        "Ç": "C",
        "ç": "c",
    }
)


def safe_print(*args: Any, **kwargs: Any) -> None:
    """Windows cp1252-safe print (mirrors stock import console hygiene)."""
    out = []
    for a in args:
        s = str(a)
        try:
            s.encode(sys.stdout.encoding or "utf-8")
        except Exception:
            s = s.translate(SAFE_PRINT_REPLACEMENTS)
        out.append(s)
    try:
        print(*out, **kwargs)
    except UnicodeEncodeError:
        print(*(x.translate(SAFE_PRINT_REPLACEMENTS) for x in out), **kwargs)


def norm_text(s: str | None) -> str:
    t = (s or "").strip()
    t = t.translate(SAFE_PRINT_REPLACEMENTS)
    return re.sub(r"\s+", " ", t).upper()


def parse_money(token: str | None) -> Decimal:
    s = (token or "").strip().replace("TL", "").strip()
    if not s or s == "-":
        return Decimal("0.00")
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    s = s.replace(".", "").replace(",", ".")
    try:
        v = Decimal(s).quantize(Decimal("0.01"))
        return -v if neg else v
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def parse_tr_date(s: str) -> date:
    return datetime.strptime(s.strip(), "%d.%m.%Y").date()


def money(val: Any) -> Decimal:
    try:
        return Decimal(str(val if val is not None else 0)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0.00")


def backup_db(db_path: Path, backups_dir: Path) -> Path | None:
    if not db_path.is_file():
        safe_print(f"  (no DB file yet at {db_path})")
        return None
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = backups_dir / f"baykus_pre_bh_cari_{stamp}.db"
    shutil.copy2(db_path, dest)
    safe_print(f"  Backup -> {dest} ({dest.stat().st_size} bytes)")
    return dest


def resolve_db_path() -> Path:
    from app.core.config import get_settings

    url = get_settings().database_url
    if not url.startswith("sqlite"):
        return Path("baykus.db")
    raw = url.split("sqlite:///", 1)[-1]
    p = Path(raw)
    if not p.is_absolute():
        p = (API_ROOT / p).resolve()
    return p


def pdftotext_layout(pdf: Path) -> str:
    try:
        # Force UTF-8: Windows default console encoding (cp1254/cp1252) otherwise
        # mangling Turkish hareket labels (Alış/Ödeme/Satış) from Poppler output.
        return subprocess.check_output(
            ["pdftotext", "-enc", "UTF-8", "-layout", str(pdf), "-"],
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise SystemExit(
            "pdftotext not found. Install poppler-utils (Linux) or Poppler for Windows "
            "and ensure pdftotext is on PATH."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pdftotext failed for {pdf}: {exc}") from exc


@dataclass
class HareketLine:
    movement_date: date
    due_date: date | None
    hareket: str
    belge_no: str
    aciklama: str
    debit: Decimal  # Baykuş debit
    credit: Decimal  # Baykuş credit
    bakiye: Decimal  # BH statement running balance (informational)
    payment_method: str = ""
    raw: str = ""
    # Compact item lines from PDF continuation rows (Satış/Alış detail).
    # Format: "NAME xQTY UNIT @PRICE=AMOUNT"
    kalems: list[str] = field(default_factory=list)


@dataclass
class ParseReport:
    party_name: str | None = None
    lines: list[HareketLine] = field(default_factory=list)
    unmatched_hints: list[str] = field(default_factory=list)
    continuity_ok: bool = True
    final_bakiye: Decimal = Decimal("0.00")


def _normalize_hareket(hareket: str) -> str:
    h = re.sub(r"\s+", " ", (hareket or "").strip())
    low = h.casefold()
    if low.startswith("borç fiş") or low == "borç" or low.startswith("borc fis") or low == "borc":
        return "Borç Fişi"
    if low.startswith("alacak fiş") or low == "alacak":
        return "Alacak Fişi"
    return h


def _customer_movement_type(hareket: str) -> str:
    h = _normalize_hareket(hareket)
    if h == "Satış":
        return "sale"
    if h in ("Tahsilat", "Ödeme"):
        return "payment"
    if h == "Devir":
        return "adjustment"
    return "adjustment"


def _supplier_movement_type(hareket: str) -> str:
    h = _normalize_hareket(hareket)
    if h == "Alış":
        return "purchase"
    if h == "Ödeme":
        return "payment"
    return "adjustment"


def _extract_party_name(lines: list[str]) -> str | None:
    for ln in lines[:12]:
        m = re.search(r"^\s*(.+?)\s*\(\s*\(\d{2}\.\d{2}\.\d{4}", ln)
        if m:
            return m.group(1).strip()
        m2 = re.search(r"^\s*(.+?)\s*\(\s*\d{2}\.\d{2}\.\d{4}", ln)
        if m2 and "Tarih" not in ln:
            return m2.group(1).strip()
    return None


def _payment_method(rest: str) -> str:
    for label in ("Kredi Kartı", "Kredi Kartı".replace("ı", "i"), "Nakit", "Banka", "Senet", "Çek"):
        if label in rest:
            return label
    # ASCII-folded common forms already in rest after layout
    low = rest.lower()
    if "nakit" in low:
        return "Nakit"
    if "banka" in low:
        return "Banka"
    if "kredi" in low and "kart" in low:
        return "Kredi Kartı"
    if "senet" in low:
        return "Senet"
    if "çek" in low or "cek" in low:
        return "Çek"
    return ""


def _belge_and_aciklama(rest: str, moneys: list[str]) -> tuple[str, str]:
    cut = rest
    for mon in moneys:
        p = cut.rfind(mon)
        if p >= 0:
            cut = cut[:p]
    cut = re.sub(
        r"\b(Nakit|Banka|Kredi\s*Kart[ıi]|Kart[ıi]|Senet|Çek|Cek)\b",
        "",
        cut,
        flags=re.I,
    )
    cut = re.sub(r"\s+", " ", cut).strip()
    toks = cut.split()
    belge = ""
    aciklama = cut
    if toks:
        t0 = toks[0]
        if re.match(r"^(?=.*\d)[A-Z0-9./_-]{4,}$", t0, re.I):
            belge = t0
            aciklama = " ".join(toks[1:])
    return decode_html_entities(belge).strip(), decode_html_entities(aciklama).strip()


UNIT_RE = re.compile(
    r"(Ad|Mtül|Mtul|Mt|M²|m2|Kg|kg|Lt|lt|Paket|Pk|Takım|Çift|Metre|m\b)",
    re.I,
)
KALEM_LINE_RE = re.compile(
    r"^\s{4,}(?P<body>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>[A-Za-zÇĞİÖŞÜçğıöşü²%]*)?\s+"
    r"(?P<rest>.*)$"
)


def _format_kalem(name: str, qty: str, unit: str, price: Decimal, amount: Decimal) -> str:
    q = qty.replace(".", "").replace(",", ".") if "," in qty else qty
    u = (unit or "").strip()
    bit = f"{name.strip()} x{q}"
    if u:
        bit += f" {u}"
    bit += f" @{price}={amount}"
    return bit


def _parse_kalem_line(ln: str) -> str | None:
    """Parse a PDF continuation item row into compact Kalem= entry, or None."""
    s = ln.rstrip()
    if not s.strip():
        return None
    if LINE_RE.match(s):
        return None
    if DATE_RE.match(s.lstrip()[:10] if s.lstrip() else ""):
        return None
    # Skip headers / footers / totals
    low = s.casefold()
    if any(
        x in low
        for x in (
            "tarih",
            "henna",
            "tabaklar",
            "cadde avm",
            "belge no",
            "sayfa",
            "toplam",
            "genel toplam",
        )
    ):
        return None
    moneys = MONEY_RE.findall(s)
    if len(moneys) < 2:
        return None
    amount = parse_money(moneys[-1])
    price = parse_money(moneys[-2])
    # Strip trailing money tokens from working copy
    cut = s
    for mon in reversed(moneys[-2:]):
        p = cut.rfind(mon)
        if p >= 0:
            cut = cut[:p]
    cut = cut.strip()
    # qty + optional unit at end of cut
    m = re.search(
        rf"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>{UNIT_RE.pattern})?\s*$",
        cut,
    )
    if m:
        name = m.group("name").strip()
        qty = m.group("qty")
        unit = (m.group("unit") or "").strip()
    else:
        # qty without unit (e.g. "TRANSFER BASKI 119")
        m2 = re.search(r"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*$", cut)
        if m2:
            name = m2.group("name").strip()
            qty = m2.group("qty")
            unit = ""
        else:
            name = cut
            qty = "1"
            unit = ""
    if not name or len(name) < 2:
        return None
    # Reject lines that are mostly numbers / noise
    if re.fullmatch(r"[\d\s.,\-]+", name):
        return None
    return _format_kalem(name, qty, unit, price, amount)


def parse_ekstre_pdf(pdf: Path, *, is_supplier: bool) -> ParseReport:
    """Parse Detaylı Ekstre PDF into Baykuş debit/credit lines.

    Amounts are derived from running Bakiye deltas (robust against Fiyat / embedded
    numbers in Açıklama). Sign mapping:

      Customer: Baykuş debit/credit == BH Borç/Alacak
      Supplier: Baykuş debit == BH Alacak (payable↑), credit == BH Borç (payment)
                so Baykuş balance ≈ −BH bakiye
    """
    text = pdftotext_layout(pdf)
    lines = text.splitlines()
    report = ParseReport(party_name=_extract_party_name(lines))

    prev_bakiye: Decimal | None = None
    matched_dates = 0

    for ln in lines:
        m = LINE_RE.match(ln)
        if not m:
            # Attach Satış/Alış item continuation rows to the previous hareket
            if report.lines:
                last = report.lines[-1]
                if last.hareket in ("Satış", "Alış"):
                    kalem = _parse_kalem_line(ln)
                    if kalem:
                        last.kalems.append(kalem)
                        continue
            # collect possible orphan date lines for quality report
            if DATE_RE.match(ln.strip()[:10] if ln.strip() else "") and "Tarih" not in ln:
                if MONEY_RE.search(ln) and not HAREKET_RE.search(ln):
                    report.unmatched_hints.append(ln.strip()[:120])
            continue

        d1, d2, hareket, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        matched_dates += 1
        moneys = MONEY_RE.findall(ln)
        if not moneys:
            report.unmatched_hints.append(f"no-money: {ln.strip()[:120]}")
            continue

        bakiye = parse_money(moneys[-1])
        if prev_bakiye is None:
            delta = bakiye  # opening assumed 0 within statement range
        else:
            delta = (bakiye - prev_bakiye).quantize(Decimal("0.01"))

        # Continuity vs explicit side amounts (best-effort quality flag only)
        if len(moneys) >= 2:
            side_amt = parse_money(moneys[-2])
            # tolerate Fiyat bleed: ignore when side_amt doesn't match |delta|
            if abs(side_amt - abs(delta)) > Decimal("0.05") and len(moneys) >= 3:
                # try moneys[-2] might be wrong; delta still authoritative
                pass

        if is_supplier:
            # BH: +borç raises bakiye, +alacak lowers; Baykuş payable uses opposite cols
            debit = max(-delta, Decimal("0.00"))
            credit = max(delta, Decimal("0.00"))
        else:
            debit = max(delta, Decimal("0.00"))
            credit = max(-delta, Decimal("0.00"))

        # Skip pure zero no-op rows (rare blank Alış)
        if debit == 0 and credit == 0 and prev_bakiye is not None and bakiye == prev_bakiye:
            prev_bakiye = bakiye
            continue

        belge, aciklama = _belge_and_aciklama(rest, moneys)
        pay = _payment_method(rest)

        report.lines.append(
            HareketLine(
                movement_date=parse_tr_date(d1),
                due_date=parse_tr_date(d2) if d2 else None,
                hareket=_normalize_hareket(hareket),
                belge_no=belge,
                aciklama=aciklama,
                debit=debit,
                credit=credit,
                bakiye=bakiye,
                payment_method=pay,
                raw=ln.strip()[:200],
            )
        )
        prev_bakiye = bakiye

    if report.lines:
        report.final_bakiye = report.lines[-1].bakiye
        # re-check continuity by reconstructing
        run = Decimal("0.00")
        for hl in report.lines:
            if is_supplier:
                run = (run + hl.credit - hl.debit).quantize(Decimal("0.01"))
                # Baykuş running ≈ -BH; compare abs to stored bakiye sign-flipped
                if abs((-run) - hl.bakiye) > Decimal("0.05") and abs(run - hl.bakiye) > Decimal("0.05"):
                    # Allow either convention on first-line edge cases
                    report.continuity_ok = False
            else:
                run = (run + hl.debit - hl.credit).quantize(Decimal("0.01"))
                if abs(run - hl.bakiye) > Decimal("0.05"):
                    report.continuity_ok = False

    return report


def load_party_list(xlsx: Path) -> list[dict[str, str]]:
    import openpyxl

    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    header = [str(c or "").strip() for c in rows[0]]
    # Flexible header map
    col = {norm_text(h): i for i, h in enumerate(header)}

    def idx(*names: str) -> int | None:
        for n in names:
            if norm_text(n) in col:
                return col[norm_text(n)]
        return None

    i_name = idx("Name", "Ad", "Ünvan", "Unvan", "Cari", "Cari Adı", "Cari Adi")
    i_guid = idx("Guid", "GUID", "Id", "ID", "BH Id", "BH_ID")
    i_file = idx("Statement file", "Statement", "PDF", "Dosya", "File")
    if i_name is None:
        raise SystemExit(f"No Name column in {xlsx}: {header}")

    out: list[dict[str, str]] = []
    for row in rows[1:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        name = decode_html_entities(row[i_name]).strip()
        if not name:
            continue
        guid = str(row[i_guid] or "").strip() if i_guid is not None else ""
        stmt = str(row[i_file] or "").strip() if i_file is not None else ""
        out.append({"name": name, "guid": guid.upper(), "statement": stmt})
    return out


def guid_from_filename(name: str) -> str | None:
    m = GUID_RE.search(name)
    return m.group(1).upper() if m else None


def movement_note(
    *,
    guid: str,
    hareket: str,
    belge: str,
    aciklama: str,
    payment_method: str,
    bh_bakiye: Decimal,
    line_idx: int,
    kalems: list[str] | None = None,
) -> str:
    hareket = decode_html_entities(hareket).strip()
    belge = decode_html_entities(belge).strip()
    aciklama = decode_html_entities(aciklama).strip()
    payment_method = decode_html_entities(payment_method).strip()
    parts = [
        f"{BH_NOTE_PREFIX}{guid}:{line_idx}",
        f"Hareket={hareket}",
    ]
    if belge:
        parts.append(f"Belge={belge}")
    if payment_method:
        parts.append(f"Odeme={payment_method}")
    if aciklama:
        parts.append(aciklama[:180])
    if kalems:
        # Keep room for BH_Bakiye; pack as many kalems as fit under 900.
        kalem_joined = "; ".join(kalems)
        prefix_len = len(" | ".join(parts)) + len(" | Kalem=") + len(f" | BH_Bakiye={bh_bakiye}")
        budget = max(40, 900 - prefix_len)
        if len(kalem_joined) > budget:
            kalem_joined = kalem_joined[: budget - 1].rstrip("; ") + "…"
        parts.append(f"Kalem={kalem_joined}")
    parts.append(f"BH_Bakiye={bh_bakiye}")
    return " | ".join(parts)[:900]


def clear_demo_parties(db) -> dict[str, int]:
    """Remove seed demo customers/suppliers (M-00x / T-00x) that are not BH-coded.

    Also removes demo purchases (RESTRICT FK) and nulls order/quote customer FKs
    (SET NULL) so SQLite integrity holds.
    """
    from sqlalchemy import text

    from app.models.customer import Customer
    from app.models.supplier import Supplier

    stats = {
        "demo_customers": 0,
        "demo_suppliers": 0,
        "demo_cari_movements": 0,
        "demo_supplier_movements": 0,
        "demo_purchases": 0,
    }

    demo_cust_ids: list[int] = []
    for c in db.query(Customer).filter(Customer.code.isnot(None)).all():
        code = c.code or ""
        if DEMO_CUSTOMER_RE.match(code) and not code.upper().startswith(BH_CODE_PREFIX):
            demo_cust_ids.append(c.id)

    demo_supp_ids: list[int] = []
    for s in db.query(Supplier).filter(Supplier.code.isnot(None)).all():
        code = s.code or ""
        if DEMO_SUPPLIER_RE.match(code) and not code.upper().startswith(BH_CODE_PREFIX):
            demo_supp_ids.append(s.id)

    if demo_cust_ids:
        ids = ",".join(str(i) for i in demo_cust_ids)
        r = db.execute(text(f"DELETE FROM cari_movements WHERE customer_id IN ({ids})"))
        stats["demo_cari_movements"] = r.rowcount or 0
        # SET NULL style refs (SQLite may not enforce ON DELETE)
        for table, col in (
            ("orders", "customer_id"),
            ("quotes", "customer_id"),
            ("special_days", "customer_id"),
            ("cash_movements", "customer_id"),
            ("bank_movements", "customer_id"),
        ):
            try:
                db.execute(text(f"UPDATE {table} SET {col} = NULL WHERE {col} IN ({ids})"))
            except Exception:
                pass
        r = db.execute(text(f"DELETE FROM customers WHERE id IN ({ids})"))
        stats["demo_customers"] = r.rowcount or 0

    if demo_supp_ids:
        ids = ",".join(str(i) for i in demo_supp_ids)
        # purchases RESTRICT — delete lines then purchases
        purch_ids = [
            row[0]
            for row in db.execute(
                text(f"SELECT id FROM purchases WHERE supplier_id IN ({ids})")
            ).fetchall()
        ]
        if purch_ids:
            pids = ",".join(str(i) for i in purch_ids)
            db.execute(text(f"DELETE FROM purchase_lines WHERE purchase_id IN ({pids})"))
            # null supplier_movements.purchase_id / any payment links if present
            try:
                db.execute(
                    text(
                        f"UPDATE supplier_movements SET purchase_id = NULL "
                        f"WHERE purchase_id IN ({pids})"
                    )
                )
            except Exception:
                pass
            r = db.execute(text(f"DELETE FROM purchases WHERE id IN ({pids})"))
            stats["demo_purchases"] = r.rowcount or 0
        r = db.execute(text(f"DELETE FROM supplier_movements WHERE supplier_id IN ({ids})"))
        stats["demo_supplier_movements"] = r.rowcount or 0
        for table, col in (
            ("cash_movements", "supplier_id"),
            ("bank_movements", "supplier_id"),
        ):
            try:
                db.execute(text(f"UPDATE {table} SET {col} = NULL WHERE {col} IN ({ids})"))
            except Exception:
                pass
        r = db.execute(text(f"DELETE FROM suppliers WHERE id IN ({ids})"))
        stats["demo_suppliers"] = r.rowcount or 0

    db.commit()
    return stats


def delete_bh_import_movements(db) -> dict[str, int]:
    from sqlalchemy import text

    c = db.execute(
        text("DELETE FROM cari_movements WHERE note LIKE :p"),
        {"p": f"{BH_NOTE_PREFIX}%"},
    )
    s = db.execute(
        text("DELETE FROM supplier_movements WHERE note LIKE :p"),
        {"p": f"{BH_NOTE_PREFIX}%"},
    )
    db.commit()
    return {
        "deleted_cari_movements": c.rowcount or 0,
        "deleted_supplier_movements": s.rowcount or 0,
    }


def upsert_customer(db, *, name: str, guid: str) -> tuple[Any, str]:
    from app.models.customer import Customer

    code = f"{BH_CODE_PREFIX}{guid}"[:50]
    existing = db.query(Customer).filter(Customer.code == code).first()
    action = "updated"
    if not existing:
        # match by name (normalized)
        for c in db.query(Customer).all():
            if norm_text(c.name) == norm_text(name) or (
                c.notes and f"BH:{guid}" in (c.notes or "").upper()
            ):
                existing = c
                break
    if existing:
        existing.name = name[:255]
        existing.code = code
        notes = existing.notes or ""
        tag = f"BH:{guid}"
        if tag not in notes:
            existing.notes = (notes + f"\n{tag}").strip() if notes else tag
        existing.is_active = True
        existing.opening_balance = Decimal("0.00")
        existing.updated_at = datetime.utcnow()
        db.flush()
        return existing, action

    row = Customer(
        code=code,
        name=name[:255],
        company=None,
        notes=f"BH:{guid}",
        is_active=True,
        opening_balance=Decimal("0.00"),
    )
    db.add(row)
    db.flush()
    return row, "created"


def upsert_supplier(db, *, name: str, guid: str) -> tuple[Any, str]:
    from app.models.supplier import Supplier

    code = f"{BH_CODE_PREFIX}{guid}"[:50]
    existing = db.query(Supplier).filter(Supplier.code == code).first()
    action = "updated"
    if not existing:
        for s in db.query(Supplier).all():
            if norm_text(s.name) == norm_text(name) or (
                s.notes and f"BH:{guid}" in (s.notes or "").upper()
            ):
                existing = s
                break
    if existing:
        existing.name = name[:255]
        existing.code = code
        notes = existing.notes or ""
        tag = f"BH:{guid}"
        if tag not in notes:
            existing.notes = (notes + f"\n{tag}").strip() if notes else tag
        existing.is_active = True
        existing.opening_balance = Decimal("0.00")
        existing.updated_at = datetime.utcnow()
        db.flush()
        return existing, action

    row = Supplier(
        code=code,
        name=name[:255],
        notes=f"BH:{guid}",
        is_active=True,
        opening_balance=Decimal("0.00"),
    )
    db.add(row)
    db.flush()
    return row, "created"


def import_party_movements(
    db,
    *,
    party_id: int,
    guid: str,
    report: ParseReport,
    is_supplier: bool,
) -> int:
    from app.models.customer import CariMovement
    from app.models.supplier import SupplierMovement

    n = 0
    for i, hl in enumerate(report.lines):
        note = movement_note(
            guid=guid,
            hareket=hl.hareket,
            belge=hl.belge_no,
            aciklama=hl.aciklama,
            payment_method=hl.payment_method,
            bh_bakiye=hl.bakiye,
            line_idx=i,
            kalems=hl.kalems,
        )
        if is_supplier:
            mtype = _supplier_movement_type(hl.hareket)
            db.add(
                SupplierMovement(
                    supplier_id=party_id,
                    movement_type=mtype,
                    debit=hl.debit,
                    credit=hl.credit,
                    movement_date=hl.movement_date,
                    purchase_id=None,
                    note=note,
                )
            )
        else:
            mtype = _customer_movement_type(hl.hareket)
            db.add(
                CariMovement(
                    customer_id=party_id,
                    movement_type=mtype,
                    debit=hl.debit,
                    credit=hl.credit,
                    movement_date=hl.movement_date,
                    order_id=None,
                    note=note,
                )
            )
        n += 1
    return n


def discover_pdfs(ekstre_dir: Path, kind: str) -> dict[str, Path]:
    """Map GUID -> pdf path for customer_* or supplier_* files."""
    out: dict[str, Path] = {}
    for pdf in sorted(ekstre_dir.glob(f"{kind}_*.pdf")):
        g = guid_from_filename(pdf.name)
        if g:
            out[g] = pdf
    return out


def run_import(ekstre_dir: Path, *, clear_demo: bool, dry_run: bool) -> dict[str, Any]:
    from app.db.session import SessionLocal
    from app.models.customer import CariMovement, Customer
    from app.models.supplier import Supplier, SupplierMovement

    customer_xlsx = ekstre_dir / "customer_list.xlsx"
    supplier_xlsx = ekstre_dir / "supplier_list.xlsx"
    if not customer_xlsx.is_file() or not supplier_xlsx.is_file():
        raise SystemExit(f"Missing master lists under {ekstre_dir}")

    customers = load_party_list(customer_xlsx)
    suppliers = load_party_list(supplier_xlsx)
    cust_pdfs = discover_pdfs(ekstre_dir, "customer")
    supp_pdfs = discover_pdfs(ekstre_dir, "supplier")

    stats: dict[str, Any] = {
        "customers_listed": len(customers),
        "suppliers_listed": len(suppliers),
        "customer_pdfs": len(cust_pdfs),
        "supplier_pdfs": len(supp_pdfs),
        "customers_created": 0,
        "customers_updated": 0,
        "suppliers_created": 0,
        "suppliers_updated": 0,
        "cari_movements": 0,
        "supplier_movements": 0,
        "pdfs_parsed_ok": 0,
        "pdfs_continuity_warn": 0,
        "pdfs_missing": [],
        "parse_unmatched_total": 0,
        "parties_without_movements": [],
    }

    if dry_run:
        for kind, parties, pdfs in (
            ("customer", customers, cust_pdfs),
            ("supplier", suppliers, supp_pdfs),
        ):
            for p in parties:
                guid = (p.get("guid") or "").upper() or guid_from_filename(p.get("statement") or "")
                pdf = pdfs.get(guid or "")
                if not pdf and p.get("statement"):
                    cand = ekstre_dir / p["statement"]
                    pdf = cand if cand.is_file() else None
                if not pdf:
                    stats["pdfs_missing"].append(f"{kind}:{p['name']}")
                    continue
                rep = parse_ekstre_pdf(pdf, is_supplier=(kind == "supplier"))
                stats["cari_movements" if kind == "customer" else "supplier_movements"] += len(rep.lines)
                if rep.continuity_ok:
                    stats["pdfs_parsed_ok"] += 1
                else:
                    stats["pdfs_continuity_warn"] += 1
                stats["parse_unmatched_total"] += len(rep.unmatched_hints)
        return stats

    db = SessionLocal()
    try:
        if clear_demo:
            demo_stats = clear_demo_parties(db)
            stats.update(demo_stats)

        del_stats = delete_bh_import_movements(db)
        stats.update(del_stats)

        # --- Customers ---
        for p in customers:
            guid = (p.get("guid") or "").upper()
            if not guid:
                guid = guid_from_filename(p.get("statement") or "") or ""
            if not guid:
                # synthesize stable id from name
                guid = hashlib.sha1(norm_text(p["name"]).encode("utf-8")).hexdigest()[:32].upper()
            row, action = upsert_customer(db, name=p["name"], guid=guid)
            stats["customers_created" if action == "created" else "customers_updated"] += 1

            pdf = cust_pdfs.get(guid)
            if not pdf and p.get("statement"):
                cand = ekstre_dir / p["statement"]
                if cand.is_file():
                    pdf = cand
            if not pdf:
                stats["pdfs_missing"].append(f"customer:{p['name']}")
                stats["parties_without_movements"].append(p["name"])
                continue

            rep = parse_ekstre_pdf(pdf, is_supplier=False)
            # Prefer PDF header name if list name is ascii-folded
            if rep.party_name and len(rep.party_name) >= 2:
                row.name = rep.party_name[:255]
            n = import_party_movements(
                db, party_id=row.id, guid=guid, report=rep, is_supplier=False
            )
            stats["cari_movements"] += n
            if n == 0:
                stats["parties_without_movements"].append(p["name"])
            if rep.continuity_ok:
                stats["pdfs_parsed_ok"] += 1
            else:
                stats["pdfs_continuity_warn"] += 1
            stats["parse_unmatched_total"] += len(rep.unmatched_hints)

            # Align opening_balance so UI balance matches BH final (customer: same sign)
            # opening + sum(d)-sum(c) == BH final  → opening=0 with full history
            row.opening_balance = Decimal("0.00")

        # --- Suppliers ---
        for p in suppliers:
            guid = (p.get("guid") or "").upper()
            if not guid:
                guid = guid_from_filename(p.get("statement") or "") or ""
            if not guid:
                guid = hashlib.sha1(norm_text(p["name"]).encode("utf-8")).hexdigest()[:32].upper()
            row, action = upsert_supplier(db, name=p["name"], guid=guid)
            stats["suppliers_created" if action == "created" else "suppliers_updated"] += 1

            pdf = supp_pdfs.get(guid)
            if not pdf and p.get("statement"):
                cand = ekstre_dir / p["statement"]
                if cand.is_file():
                    pdf = cand
            if not pdf:
                stats["pdfs_missing"].append(f"supplier:{p['name']}")
                stats["parties_without_movements"].append(p["name"])
                continue

            rep = parse_ekstre_pdf(pdf, is_supplier=True)
            if rep.party_name and len(rep.party_name) >= 2:
                row.name = rep.party_name[:255]
            n = import_party_movements(
                db, party_id=row.id, guid=guid, report=rep, is_supplier=True
            )
            stats["supplier_movements"] += n
            if n == 0:
                stats["parties_without_movements"].append(p["name"])
            if rep.continuity_ok:
                stats["pdfs_parsed_ok"] += 1
            else:
                stats["pdfs_continuity_warn"] += 1
            stats["parse_unmatched_total"] += len(rep.unmatched_hints)
            row.opening_balance = Decimal("0.00")

        db.commit()

        # Smoke
        stats["smoke_customers"] = db.query(Customer).count()
        stats["smoke_suppliers"] = db.query(Supplier).count()
        stats["smoke_cari_movements"] = db.query(CariMovement).count()
        stats["smoke_supplier_movements"] = db.query(SupplierMovement).count()

        # Sample balances
        from sqlalchemy import func

        samples = []
        for c in db.query(Customer).order_by(Customer.name).limit(5).all():
            row = (
                db.query(
                    func.coalesce(func.sum(CariMovement.debit), 0),
                    func.coalesce(func.sum(CariMovement.credit), 0),
                )
                .filter(CariMovement.customer_id == c.id)
                .one()
            )
            bal = money(c.opening_balance) + money(row[0]) - money(row[1])
            samples.append(f"C {c.name}: bal={bal}")
        for s in db.query(Supplier).order_by(Supplier.name).limit(5).all():
            row = (
                db.query(
                    func.coalesce(func.sum(SupplierMovement.debit), 0),
                    func.coalesce(func.sum(SupplierMovement.credit), 0),
                )
                .filter(SupplierMovement.supplier_id == s.id)
                .one()
            )
            bal = money(s.opening_balance) + money(row[0]) - money(row[1])
            samples.append(f"S {s.name}: bal={bal}")
        stats["sample_balances"] = samples
    finally:
        db.close()

    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="BizimHesap → Baykuş cari list+ekstre import")
    parser.add_argument(
        "--ekstre-dir",
        default="",
        help="Directory with customer_list.xlsx, supplier_list.xlsx, PDFs "
        "(default: ../../tmp/bizimhesap/ekstre)",
    )
    parser.add_argument("--skip-backup", action="store_true")
    parser.add_argument(
        "--keep-demo",
        action="store_true",
        help="Do not delete seed M-00x / T-00x demo parties",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse only; do not write DB")
    args = parser.parse_args(argv)

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "postgresql" in db_url:
        os.environ["DATABASE_URL"] = "sqlite:///./baykus.db"
        try:
            from app.core.config import get_settings

            get_settings.cache_clear()
        except Exception:
            pass

    ekstre = Path(args.ekstre_dir) if args.ekstre_dir else (API_ROOT.parent.parent / "tmp" / "bizimhesap" / "ekstre")
    if not ekstre.is_absolute():
        ekstre = (API_ROOT / ekstre).resolve()

    safe_print("=== BizimHesap -> Baykus cari import ===")
    safe_print(f"  cwd={Path.cwd()}")
    safe_print(f"  DATABASE_URL={os.environ.get('DATABASE_URL')}")
    safe_print(f"  ekstre_dir={ekstre}")

    if not ekstre.is_dir():
        raise SystemExit(f"Ekstre directory not found: {ekstre}")

    if not args.dry_run:
        from app.bootstrap_sqlite import is_sqlite

        if is_sqlite():
            import app.models  # noqa: F401
            from app.db.base import Base
            from app.db.session import engine

            Base.metadata.create_all(bind=engine)

        db_path = resolve_db_path()
        if not args.skip_backup:
            safe_print("  Backing up SQLite ...")
            backup_db(db_path, API_ROOT / "backups")

    stats = run_import(ekstre, clear_demo=not args.keep_demo, dry_run=args.dry_run)
    safe_print("  Done:")
    for k, v in stats.items():
        if k == "sample_balances":
            safe_print("    sample_balances:")
            for s in v:
                safe_print(f"      {s}")
        elif k in ("pdfs_missing", "parties_without_movements") and isinstance(v, list):
            safe_print(f"    {k}: {len(v)}")
            for item in v[:12]:
                safe_print(f"      - {item}")
            if len(v) > 12:
                safe_print(f"      ... +{len(v) - 12} more")
        else:
            safe_print(f"    {k}: {v}")

    safe_print("=== cari import complete ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
