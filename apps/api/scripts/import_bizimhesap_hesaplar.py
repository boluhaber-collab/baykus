#!/usr/bin/env python3
"""BizimHesap Hesaplarım (kasa / banka / ortak) → Baykuş SQLite.

Source (B2B API has NO kasa/banka history):
  tmp/bizimhesap/hesaplarim/
    banka_hesaplari.xlsx      — account list (Banka / Şirket Ortağı)
    banka_hareketleri.xlsx    — bank + partner movements
    kasa_hareketleri.xlsx     — TL Kasa movements
    raporlar/*.xlsx           — raw BH "KASA RAPORU" panel exports (reference)
    manifest.json

Usage (from apps/api, with venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/import_bizimhesap_hesaplar.py
  python scripts/import_bizimhesap_hesaplar.py --hesap-dir ../../tmp/bizimhesap/hesaplarim
  python -m app.scripts.import_bizimhesap_hesaplar
  python scripts/import_bizimhesap_hesaplar.py --dry-run

Wipe / upsert policy (see docs/BIZIMHESAP_IMPORT.md §6):
  - BACKUP baykus.db first
  - Null expense/loan FKs pointing at cash/bank rows being cleared
  - Remove prior BH_IMPORT-tagged cash/bank movements (idempotent)
  - Optionally wipe seed demo kasa/banka (Ana Kasa demo moves, Ziraat/Garanti Ticari)
  - Upsert CashRegister "TL Kasa" + BankAccount rows (ortaklar → account_type=Şirket Ortağı)
  - Import movements; opening_balance=0 (full history)
"""

from __future__ import annotations

import argparse
import html
import hashlib
import os
import re
import shutil
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

BH_NOTE_PREFIX = "BH_IMPORT:"
CASH_REGISTER_NAME = "TL Kasa"

# Seed demo bank names from app/seed.py
DEMO_BANK_NAMES = {"Ziraat İşletme", "Garanti Ticari"}
DEMO_BANK_IBANS = {
    "TR330001000158123456789001",
    "TR640006200012345678901234",
}

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


def money(val: Any) -> Decimal:
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val.quantize(Decimal("0.01"))
    if isinstance(val, (int, float)):
        return Decimal(str(val)).quantize(Decimal("0.01"))
    s = str(val).strip().replace("TL", "").strip()
    if not s or s == "-":
        return Decimal("0.00")
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        v = Decimal(s).quantize(Decimal("0.01"))
        return -v if neg else v
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def parse_tr_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def slug_key(*parts: str | None) -> str:
    raw = "|".join((p or "").strip() for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16].upper()
    return digest


def backup_db(db_path: Path, backups_dir: Path) -> Path | None:
    if not db_path.is_file():
        safe_print(f"  (no DB file yet at {db_path})")
        return None
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = backups_dir / f"baykus_pre_bh_hesaplar_{stamp}.db"
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


def load_accounts(xlsx: Path) -> list[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(xlsx, data_only=True)
    rows = list(wb.active.iter_rows(values_only=True))
    if not rows:
        return []
    header = [str(c or "").strip() for c in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    def col(*names: str) -> int | None:
        for n in names:
            if n in idx:
                return idx[n]
        return None

    i_type = col("Hesap Türü", "Hesap Turu", "Tür", "Tur")
    i_inst = col("Banka Adı", "Banka", "Kurum", "Institution")
    i_name = col("Hesap Adı", "Hesap", "Ad", "Name")
    i_iban = col("IBAN")
    i_open = col("Açılış Bakiyesi", "Acilis Bakiyesi", "Opening")
    i_note = col("Not", "Notes", "Note")
    i_aid = col("Aktarım ID", "Aktarim ID", "Transfer ID")

    out: list[dict[str, Any]] = []
    for r in rows[1:]:
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        def cell(i, default=""):
            if i is None:
                return default
            v = r[i]
            return default if v is None else v

        account_type = str(cell(i_type, "Banka")).strip() or "Banka"
        institution = str(cell(i_inst, "")).strip() or None
        name = str(cell(i_name, "")).strip()
        if not name:
            continue
        iban = str(cell(i_iban, "")).strip() or None
        opening = money(cell(i_open, 0))
        note = str(cell(i_note, "")).strip() or None
        aid = str(cell(i_aid, "")).strip() or None
        display = f"{institution} - {name}" if institution else name
        key = aid or f"BH-ACC-{slug_key(account_type, institution, name)}"
        out.append(
            {
                "account_type": account_type,
                "institution": institution,
                "name": name,
                "iban": iban,
                "opening_balance": opening,
                "note": note,
                "aktarim_id": aid,
                "key": key,
                "display": display,
            }
        )
    return out


def load_moves(xlsx: Path, *, kind: str) -> list[dict[str, Any]]:
    """kind: 'bank' (has Hesap col) or 'cash'."""
    from openpyxl import load_workbook

    wb = load_workbook(xlsx, data_only=True)
    rows = list(wb.active.iter_rows(values_only=True))
    if not rows:
        return []
    header = [str(c or "").strip() for c in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    def col(*names: str) -> int | None:
        for n in names:
            if n in idx:
                return idx[n]
        return None

    i_date = col("Tarih", "Date")
    i_hesap = col("Hesap", "Hesap Adı") if kind == "bank" else None
    i_islem = col("İşlem", "Islem", "Tipi", "Type")
    i_acik = col("Açıklama", "Aciklama", "Note", "Description")
    i_giris = col("Giriş", "Giris", "Borç", "Borc", "In")
    i_cikis = col("Çıkış", "Cikis", "Alacak", "Out")
    i_aid = col("Aktarım ID", "Aktarim ID", "Transfer ID")
    i_cat = col("Ödeme Türü", "Odeme Turu", "Category")
    i_src = col("Kaynak", "Source")
    i_must = col("Müşteri", "Musteri", "Counterparty")

    out: list[dict[str, Any]] = []
    for n, r in enumerate(rows[1:], start=1):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        d = parse_tr_date(r[i_date] if i_date is not None else None)
        if not d:
            continue
        def cell(i, default=""):
            if i is None:
                return default
            v = r[i]
            return default if v is None else v

        islem = html.unescape(str(cell(i_islem, "")).strip())
        acik = html.unescape(str(cell(i_acik, "")).strip())
        giris = money(cell(i_giris, 0))
        cikis = money(cell(i_cikis, 0))
        aid = str(cell(i_aid, "")).strip() or None
        if not aid:
            aid = f"BH-{kind.upper()}-{n:05d}-{slug_key(str(d), islem, acik, str(giris), str(cikis))}"
        hesap = html.unescape(str(cell(i_hesap, "")).strip()) or None if kind == "bank" else None
        muster = html.unescape(str(cell(i_must, "")).strip()) or None if i_must is not None else None
        out.append(
            {
                "date": d,
                "hesap": hesap,
                "islem": islem,
                "aciklama": acik,
                "giris": giris,
                "cikis": cikis,
                "aktarim_id": aid,
                "category": str(cell(i_cat, "")).strip() or None,
                "source": str(cell(i_src, "")).strip() or None,
                "counterparty": muster,
            }
        )
    return out


def map_cash_type(islem: str, aciklama: str, giris: Decimal, cikis: Decimal) -> tuple[str, Decimal]:
    amount = giris if giris > 0 else cikis
    if amount <= 0:
        amount = max(giris, cikis)
    islem_l = islem.lower()
    acik_l = (aciklama or "").lower()
    if "tahsilat" in islem_l or "borç fiş" in islem_l or "borc fis" in islem_l:
        return "tahsilat", giris or amount
    if "ödeme" in islem_l or "odeme" in islem_l:
        if "gider" in acik_l or "masraf" in acik_l:
            return "gider", cikis or amount
        return "odeme", cikis or amount
    if "para giriş" in islem_l or "para giris" in islem_l:
        return "transfer_in", giris or amount
    if "para çıkış" in islem_l or "para cikis" in islem_l:
        return "transfer_out", cikis or amount
    if "alacak fiş" in islem_l or "alacak fis" in islem_l:
        return "odeme", cikis or amount
    if giris > 0:
        return "tahsilat", giris
    return "odeme", cikis or amount


def map_bank_type(islem: str, aciklama: str, giris: Decimal, cikis: Decimal) -> tuple[str, Decimal]:
    """Map BH Tipi to BankMovement. Prefer işlem label over açıklama keywords.

    Important: descriptions like "AÇILIŞ MASRAFLARI" on Para Girişi must NOT become fee.
    """
    amount = giris if giris > 0 else cikis
    if amount <= 0:
        amount = max(giris, cikis)
    islem_l = islem.lower()
    acik_l = (aciklama or "").lower()
    # Explicit movement types first
    if "tahsilat" in islem_l or "borç fiş" in islem_l or "borc fis" in islem_l:
        return "deposit", giris or amount
    if "ödeme" in islem_l or "odeme" in islem_l:
        return "withdrawal", cikis or amount
    if "para giriş" in islem_l or "para giris" in islem_l:
        return "transfer_in", giris or amount
    if "para çıkış" in islem_l or "para cikis" in islem_l:
        return "transfer_out", cikis or amount
    if "alacak fiş" in islem_l or "alacak fis" in islem_l:
        return "withdrawal", cikis or amount
    # Fee only when işlem itself is a fee/masraf OR outflow with fee keywords
    if islem_l in ("masraf", "komisyon", "fee") or (
        cikis > 0 and giris <= 0 and any(k in acik_l for k in ("masraf", "komisyon", "fee"))
    ):
        return "fee", cikis or amount
    if giris > 0:
        return "deposit", giris
    return "withdrawal", cikis or amount


def movement_note(
    aid: str,
    aciklama: str,
    source: str | None = None,
    counterparty: str | None = None,
    islem: str | None = None,
) -> str:
    parts = [f"{BH_NOTE_PREFIX}{aid}"]
    if islem:
        parts.append(f"Hareket={islem}")
    if counterparty:
        parts.append(f"Cari={counterparty[:120]}")
    if aciklama:
        parts.append(aciklama[:400])
    if source:
        parts.append(f"Kaynak={source}")
    return " | ".join(parts)[:900]


def clear_demo_and_bh(db, *, clear_demo: bool) -> dict[str, int]:
    from app.models.expense import Expense
    from app.models.finance import BankAccount, BankMovement, CashMovement, CashRegister
    from app.models.loan import LoanInstallment

    stats = {
        "null_expense_fks": 0,
        "null_loan_fks": 0,
        "deleted_bh_cash_movements": 0,
        "deleted_bh_bank_movements": 0,
        "deleted_demo_cash_movements": 0,
        "deleted_demo_bank_movements": 0,
        "deleted_demo_banks": 0,
        "deleted_orphan_banks": 0,
    }

    # Always remove prior BH_IMPORT movements
    bh_cash = (
        db.query(CashMovement)
        .filter(CashMovement.note.isnot(None), CashMovement.note.like(f"{BH_NOTE_PREFIX}%"))
        .all()
    )
    stats["deleted_bh_cash_movements"] = len(bh_cash)
    for m in bh_cash:
        db.delete(m)

    bh_bank = (
        db.query(BankMovement)
        .filter(BankMovement.note.isnot(None), BankMovement.note.like(f"{BH_NOTE_PREFIX}%"))
        .all()
    )
    stats["deleted_bh_bank_movements"] = len(bh_bank)
    for m in bh_bank:
        db.delete(m)
    db.flush()

    if clear_demo:
        # Null FKs from expenses / loan installments so we can wipe demo finance rows
        for e in db.query(Expense).all():
            changed = False
            for attr in ("cash_register_id", "bank_account_id", "cash_movement_id", "bank_movement_id"):
                if getattr(e, attr, None) is not None:
                    setattr(e, attr, None)
                    changed = True
            if changed:
                stats["null_expense_fks"] += 1
        for li in db.query(LoanInstallment).all():
            changed = False
            for attr in ("cash_register_id", "bank_account_id", "cash_movement_id", "bank_movement_id"):
                if getattr(li, attr, None) is not None:
                    setattr(li, attr, None)
                    changed = True
            if changed:
                stats["null_loan_fks"] += 1
        db.flush()

        # Delete remaining (non-BH) cash/bank movements — seed + smoke
        left_cash = db.query(CashMovement).all()
        stats["deleted_demo_cash_movements"] = len(left_cash)
        for m in left_cash:
            db.delete(m)
        left_bank = db.query(BankMovement).all()
        stats["deleted_demo_bank_movements"] = len(left_bank)
        for m in left_bank:
            db.delete(m)
        db.flush()

        # Delete ALL bank accounts (demo + prior BH) so renamed live accounts do not duplicate
        for acc in db.query(BankAccount).all():
            is_demo = (acc.name in DEMO_BANK_NAMES) or ((acc.iban or "") in DEMO_BANK_IBANS)
            db.delete(acc)
            if is_demo:
                stats["deleted_demo_banks"] += 1
            else:
                stats["deleted_orphan_banks"] += 1
        db.flush()

        # Reset cash registers to a single TL Kasa shell (re-upserted later)
        for reg in db.query(CashRegister).all():
            if reg.name != CASH_REGISTER_NAME:
                # rename Ana Kasa in place if only one, else delete extras
                pass
        regs = db.query(CashRegister).order_by(CashRegister.id.asc()).all()
        if regs:
            keep = regs[0]
            keep.name = CASH_REGISTER_NAME
            keep.opening_balance = Decimal("0.00")
            keep.currency = "TRY"
            keep.is_active = True
            for extra in regs[1:]:
                db.delete(extra)
        db.flush()

    return stats


def upsert_cash_register(db) -> Any:
    from app.models.finance import CashRegister

    reg = (
        db.query(CashRegister)
        .filter(CashRegister.name == CASH_REGISTER_NAME)
        .order_by(CashRegister.id.asc())
        .first()
    )
    if not reg:
        reg = db.query(CashRegister).order_by(CashRegister.id.asc()).first()
    if reg:
        reg.name = CASH_REGISTER_NAME
        reg.opening_balance = Decimal("0.00")
        reg.currency = "TRY"
        reg.is_active = True
        return reg, "updated"
    reg = CashRegister(
        name=CASH_REGISTER_NAME,
        opening_balance=Decimal("0.00"),
        currency="TRY",
        is_active=True,
    )
    db.add(reg)
    db.flush()
    return reg, "created"


def upsert_bank_account(db, acc: dict[str, Any]) -> tuple[Any, str]:
    from app.models.finance import BankAccount

    tag = f"{BH_NOTE_PREFIX}{acc['key']}"
    existing = None
    # match by BH tag in notes
    for row in db.query(BankAccount).all():
        notes = row.notes or ""
        if tag in notes or (acc.get("aktarim_id") and acc["aktarim_id"] in notes):
            existing = row
            break
    if existing is None:
        # match by name + institution
        q = db.query(BankAccount).filter(BankAccount.name == acc["name"])
        if acc.get("institution"):
            cand = [r for r in q.all() if (r.institution or "") == (acc["institution"] or "")]
            existing = cand[0] if cand else None
        else:
            existing = q.first()

    note_body = acc.get("note") or ""
    notes = tag if not note_body else f"{tag} | {note_body}"

    atype = acc["account_type"]
    if atype not in ("Banka", "POS", "Kredi Kartı", "Şirket Ortağı"):
        # closest mapping
        low = atype.lower()
        if "ortak" in low:
            atype = "Şirket Ortağı"
        elif "pos" in low:
            atype = "POS"
        elif "kart" in low:
            atype = "Kredi Kartı"
        else:
            atype = "Banka"

    if existing:
        existing.name = acc["name"][:150]
        existing.account_type = atype
        existing.institution = (acc.get("institution") or None)
        if acc.get("iban"):
            existing.iban = acc["iban"][:34]
        existing.currency = "TRY"
        existing.opening_balance = Decimal("0.00")
        existing.is_active = True
        existing.notes = notes[:2000]
        return existing, "updated"

    row = BankAccount(
        name=acc["name"][:150],
        account_type=atype,
        institution=acc.get("institution"),
        iban=(acc.get("iban") or None),
        currency="TRY",
        opening_balance=Decimal("0.00"),
        is_active=True,
        notes=notes[:2000],
    )
    db.add(row)
    db.flush()
    return row, "created"


def run_import(hesap_dir: Path, *, clear_demo: bool, dry_run: bool) -> dict[str, Any]:
    accounts_xlsx = hesap_dir / "banka_hesaplari.xlsx"
    bank_xlsx = hesap_dir / "banka_hareketleri.xlsx"
    cash_xlsx = hesap_dir / "kasa_hareketleri.xlsx"
    for p in (accounts_xlsx, bank_xlsx, cash_xlsx):
        if not p.is_file():
            raise SystemExit(f"Missing required file: {p}")

    accounts = load_accounts(accounts_xlsx)
    bank_moves = load_moves(bank_xlsx, kind="bank")
    cash_moves = load_moves(cash_xlsx, kind="cash")

    stats: dict[str, Any] = {
        "accounts_listed": len(accounts),
        "bank_moves_listed": len(bank_moves),
        "cash_moves_listed": len(cash_moves),
        "accounts_by_type": {},
        "cash_registers_upserted": 0,
        "banks_created": 0,
        "banks_updated": 0,
        "cash_movements_written": 0,
        "bank_movements_written": 0,
        "unmatched_bank_moves": 0,
        "skipped_zero_amount": 0,
        "oos_gaps": [
            "Banka EUR Hesabı exists in B2B /cashiers but has 0 movements and is hidden on Hesaplarım UI",
            "User screenshot TL Kasa ~2.155.087 was stale vs live panel 402,06 (2026-09-27); live used as truth",
        ],
        "reconcile_targets": {},
    }
    for a in accounts:
        t = a["account_type"]
        stats["accounts_by_type"][t] = stats["accounts_by_type"].get(t, 0) + 1
    # +1 cash
    stats["accounts_by_type"]["Kasa"] = stats["accounts_by_type"].get("Kasa", 0) + 1

    if dry_run:
        # validate mapping coverage
        display_set = {a["display"] for a in accounts}
        for m in bank_moves:
            if m["hesap"] not in display_set:
                stats["unmatched_bank_moves"] += 1
        return stats

    from app.db.session import SessionLocal
    from app.models.finance import BankMovement, CashMovement

    db = SessionLocal()
    try:
        wipe = clear_demo_and_bh(db, clear_demo=clear_demo)
        stats.update(wipe)

        reg, _ = upsert_cash_register(db)
        stats["cash_registers_upserted"] = 1

        acc_by_display: dict[str, Any] = {}
        for a in accounts:
            row, action = upsert_bank_account(db, a)
            stats["banks_created" if action == "created" else "banks_updated"] += 1
            acc_by_display[a["display"]] = row
            # also allow name-only match
            acc_by_display[a["name"]] = row

        db.flush()

        # Cash movements
        for m in cash_moves:
            mtype, amount = map_cash_type(m["islem"], m["aciklama"], m["giris"], m["cikis"])
            if amount <= 0:
                stats["skipped_zero_amount"] += 1
                continue
            db.add(
                CashMovement(
                    cash_register_id=reg.id,
                    movement_type=mtype,
                    amount=amount,
                    movement_date=m["date"],
                    category=m.get("category"),
                    note=movement_note(m["aktarim_id"], m["aciklama"], m.get("source"), m.get("counterparty"), m.get("islem")),
                )
            )
            stats["cash_movements_written"] += 1

        # Bank movements
        for m in bank_moves:
            acc = acc_by_display.get(m["hesap"] or "")
            if acc is None:
                # fuzzy: endswith name
                hedef = (m["hesap"] or "").strip()
                for disp, row in acc_by_display.items():
                    if disp == hedef or hedef.endswith(f" - {row.name}") or hedef == row.name:
                        acc = row
                        break
            if acc is None:
                stats["unmatched_bank_moves"] += 1
                continue
            mtype, amount = map_bank_type(m["islem"], m["aciklama"], m["giris"], m["cikis"])
            if amount <= 0:
                stats["skipped_zero_amount"] += 1
                continue
            db.add(
                BankMovement(
                    bank_account_id=acc.id,
                    movement_type=mtype,
                    amount=amount,
                    movement_date=m["date"],
                    category=m.get("category"),
                    note=movement_note(m["aktarim_id"], m["aciklama"], m.get("source"), m.get("counterparty"), m.get("islem")),
                )
            )
            stats["bank_movements_written"] += 1

        db.commit()

        # Smoke counts + balances
        from sqlalchemy import case, func
        from app.models.finance import (
            BANK_IN_TYPES,
            CASH_IN_TYPES,
            BankAccount,
            CashRegister,
        )

        stats["smoke_cash_registers"] = db.query(CashRegister).count()
        stats["smoke_bank_accounts"] = db.query(BankAccount).count()
        stats["smoke_cash_movements"] = db.query(CashMovement).count()
        stats["smoke_bank_movements"] = db.query(BankMovement).count()

        samples = []
        for r in db.query(CashRegister).all():
            row = (
                db.query(
                    func.coalesce(
                        func.sum(
                            case(
                                (CashMovement.movement_type.in_(CASH_IN_TYPES), CashMovement.amount),
                                else_=-CashMovement.amount,
                            )
                        ),
                        0,
                    )
                )
                .filter(CashMovement.cash_register_id == r.id)
                .scalar()
            )
            bal = money(r.opening_balance) + money(row)
            samples.append(f"KASA {r.name}: bal={bal}")
        for a in db.query(BankAccount).order_by(BankAccount.account_type, BankAccount.name).all():
            row = (
                db.query(
                    func.coalesce(
                        func.sum(
                            case(
                                (BankMovement.movement_type.in_(BANK_IN_TYPES), BankMovement.amount),
                                else_=-BankMovement.amount,
                            )
                        ),
                        0,
                    )
                )
                .filter(BankMovement.bank_account_id == a.id)
                .scalar()
            )
            bal = money(a.opening_balance) + money(row)
            samples.append(f"{a.account_type} {a.institution or ''} / {a.name}: bal={bal}")
        stats["sample_balances"] = samples

        # Reconcile vs live targets from manifest.json (if present)
        import json
        man_path = hesap_dir / "manifest.json"
        targets = {}
        if man_path.is_file():
            man = json.loads(man_path.read_text(encoding="utf-8"))
            for a in man.get("accounts") or []:
                key = a.get("name") or ""
                if a.get("balance") is not None:
                    targets[key] = money(a["balance"])
        recon = []
        # map Baykuş names back to BH titles
        name_to_bh = {
            "TL Kasa": "TL Kasa",
            "Engin KARAGÖZ": "ENGİN",
            "Nevin KARAGÖZ": "NEVİN",
            "AKBANK": "AKBANK",
            "Garanti Bankası": "Garanti Bankası",
            "QNB KREDİ HESABI": "QNB KREDİ HESABI",
            "VAKIFBANK": "VAKIFBANK",
            "6972": "Vafıkbank (6972)",
            "0083": "Vakıfbank (0083)",
            "BAYKUŞ.COM": "BAYKUŞ.COM",
            "POS Hesabı": "POS Hesabı",
            "FON HESABI": "FON HESABI",
            "Banka TL Hesabı": "Banka TL Hesabı",
        }
        for line in samples:
            # "KASA TL Kasa: bal=..." or "Banka Akbank / AKBANK: bal=..."
            try:
                left, bal_s = line.rsplit("bal=", 1)
                bal = money(bal_s)
            except ValueError:
                continue
            bh_name = None
            if left.startswith("KASA "):
                bh_name = left[5:].rstrip(": ").strip()
            else:
                # type inst / name
                if " / " in left:
                    nm = left.split(" / ", 1)[1].rstrip(": ").strip()
                else:
                    nm = left.split(" ", 1)[-1].rstrip(": ").strip()
                bh_name = name_to_bh.get(nm, nm)
            tgt = targets.get(bh_name)
            if tgt is None:
                recon.append(f"{bh_name}: baykus={bal} target=MISSING")
            else:
                diff = (bal - tgt).quantize(Decimal("0.01"))
                ok = abs(diff) <= Decimal("0.01")
                recon.append(f"{bh_name}: baykus={bal} bh={tgt} diff={diff} {'OK' if ok else 'FAIL'}")
        stats["reconcile"] = recon
        stats["reconcile_ok"] = all(x.endswith("OK") for x in recon if "target=MISSING" not in x)
    finally:
        db.close()

    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="BizimHesap → Baykuş kasa/banka/ortak import")
    parser.add_argument(
        "--hesap-dir",
        default="",
        help="Directory with banka_hesaplari.xlsx, banka_hareketleri.xlsx, kasa_hareketleri.xlsx "
        "(default: ../../tmp/bizimhesap/hesaplarim)",
    )
    parser.add_argument("--skip-backup", action="store_true")
    parser.add_argument(
        "--keep-demo",
        action="store_true",
        help="Do not wipe seed demo kasa/banka rows (still refreshes BH_IMPORT movements)",
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

    hesap = (
        Path(args.hesap_dir)
        if args.hesap_dir
        else (API_ROOT.parent.parent / "tmp" / "bizimhesap" / "hesaplarim")
    )
    if not hesap.is_absolute():
        hesap = (API_ROOT / hesap).resolve()

    safe_print("=== BizimHesap -> Baykus kasa/banka/ortak import ===")
    safe_print(f"  cwd={Path.cwd()}")
    safe_print(f"  DATABASE_URL={os.environ.get('DATABASE_URL')}")
    safe_print(f"  hesap_dir={hesap}")

    if not hesap.is_dir():
        raise SystemExit(f"Hesap directory not found: {hesap}")

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

    stats = run_import(hesap, clear_demo=not args.keep_demo, dry_run=args.dry_run)
    safe_print("  Done:")
    for k, v in stats.items():
        if k == "sample_balances":
            safe_print("    sample_balances:")
            for s in v:
                safe_print(f"      {s}")
        elif k == "accounts_by_type":
            safe_print(f"    {k}: {v}")
        elif k == "oos_gaps":
            safe_print("    oos_gaps:")
            for g in v:
                safe_print(f"      - {g}")
        elif k == "reconcile":
            safe_print("    reconcile:")
            for s in v:
                safe_print(f"      {s}")
        else:
            safe_print(f"    {k}: {v}")

    safe_print("=== hesaplar import complete ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
