#!/usr/bin/env python3
"""BizimHesap Krediler → Baykuş loans + loan_installments.

B2B API has NO kredi endpoint. Source: panel Nakit Yönetimi > Krediler:
  GET /api/AngularControllers/credits/getcredits
  GET /api/AngularControllers/credits/getremainingcreditplans/{idCredit}
  GET /api/AngularControllers/credits/GetRemainingPayments
  GET /api/AngularControllers/credits/GetCurrentMonthPayments
  GET /web/ngn/acc/ngncredit?rc=1&guid={GUID}  — full installment table

Cached export (gitignore):
  tmp/bizimhesap/krediler/loans.json
  tmp/bizimhesap/krediler/credits.json
  tmp/bizimhesap/krediler/manifest.json

Usage (from apps/api, venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/import_bizimhesap_krediler.py --live
  python scripts/import_bizimhesap_krediler.py --from-cache ../../tmp/bizimhesap/krediler
  python -m app.scripts.import_bizimhesap_krediler
  python scripts/import_bizimhesap_krediler.py --dry-run

Wipe / import policy:
  - BACKUP baykus.db
  - Delete ALL loan_installments then loans (seed demo + prior BH)
  - Insert BH loans; installments with is_paid / paid_at from panel
  - Paid installments: payment_method=banka, optional bank_account_id match
  - NO new cash/bank movements (Hesaplarım import owns ledger — avoid double-count)
  - notes carry BH_IMPORT:BH-LOAN:{guid}
"""

from __future__ import annotations

import argparse
import html as htmlmod
import http.cookiejar
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

from app.utils.html_text import decode_html_entities

BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
BH_NOTE_PREFIX = "BH_IMPORT:BH-LOAN:"
BH_PLAN_PREFIX = "BH-PLAN:"
DEFAULT_CACHE = Path("../../tmp/bizimhesap/krediler")
BASE = "https://uygulama.bizimhesap.com"
ANG_API = f"{BASE}/api/AngularControllers"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

TR_MONTHS = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}

SAFE_PRINT_REPLACEMENTS = str.maketrans(
    {
        "İ": "I", "ı": "i", "Ş": "S", "ş": "s", "Ğ": "G", "ğ": "g",
        "Ü": "U", "ü": "u", "Ö": "O", "ö": "o", "Ç": "C", "ç": "c",
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


def parse_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    # ISO with time
    if "T" in s:
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        except ValueError:
            pass
    return None


def parse_tr_long_date(s: str) -> date | None:
    """'20 Ocak 2026' → date."""
    parts = (s or "").strip().split()
    if len(parts) != 3:
        return None
    try:
        d = int(parts[0])
        m = TR_MONTHS.get(parts[1].casefold())
        y = int(parts[2])
    except ValueError:
        return None
    if not m:
        return None
    try:
        return date(y, m, d)
    except ValueError:
        return None


def parse_paid_cell(s: str) -> tuple[Decimal, date | None]:
    """'6.344,55 20.01.2026' or '0,00' → (amount, paid_date)."""
    s = (s or "").strip()
    if not s or s == "0,00":
        return Decimal("0.00"), None
    m = re.match(r"^([\d.]+,\d{2})\s+(\d{2}\.\d{2}\.\d{4})$", s)
    if m:
        return money(m.group(1)), parse_date(m.group(2))
    m = re.match(r"^([\d.]+,\d{2})$", s)
    if m:
        return money(m.group(1)), None
    bits = s.split()
    return money(bits[0]) if bits else Decimal("0.00"), None


def load_secrets_card() -> dict:
    if not BOX_SECRETS.is_file():
        return {}
    data = json.loads(BOX_SECRETS.read_text(encoding="utf-8"))
    card = data.get("card") if isinstance(data, dict) else {}
    return card if isinstance(card, dict) else {}


def backup_db(db_path: Path) -> Path | None:
    if not db_path.is_file():
        return None
    bak_dir = API_ROOT / "backups"
    bak_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = bak_dir / f"baykus_pre_bh_krediler_{stamp}.db"
    shutil.copy2(db_path, dest)
    return dest


def build_opener():
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )


def req(opener, url: str, data: dict | None = None) -> tuple[int, str, bytes]:
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "tr-TR,tr;q=0.9"}
    body = None
    if data is not None:
        body = urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    r = urllib.request.Request(url, data=body, headers=h)
    try:
        with opener.open(r, timeout=90) as resp:
            return resp.status, resp.geturl(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, getattr(e, "url", url), e.read()


def grab(name: str, src: str) -> str:
    m = re.search(rf'name="{name}"[^>]*value="([^"]*)"', src) or re.search(
        rf'id="{name}"[^>]*value="([^"]*)"', src
    )
    return m.group(1) if m else ""


def login(opener, user: str, password: str) -> None:
    st, _, raw = req(opener, f"{BASE}/bhlogin")
    text = raw.decode("utf-8", "ignore")
    payload = {
        "__EVENTTARGET": "btnLogin",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": grab("__VIEWSTATE", text),
        "__VIEWSTATEGENERATOR": grab("__VIEWSTATEGENERATOR", text),
        "txtEmail": user,
        "txtPassword": password,
        "reCAPTCHAToken": "",
    }
    st, final, raw = req(opener, f"{BASE}/bhlogin", data=payload)
    if "newportal" not in final and "ngn" not in final:
        raise SystemExit(f"BH login failed (landed on {final})")
    safe_print(f"  Logged in -> {final}")


def parse_installments_html(html: str) -> tuple[list[dict[str, Any]], str | None]:
    """Parse ngncredit detail tbody → installments + lender account name."""
    lender = None
    m = re.search(r'id="lblCreditAccountName"[^>]*>([^<]*)<', html)
    if m:
        lender = htmlmod.unescape(m.group(1)).strip() or None

    tb = re.search(r"<tbody[^>]*>(.*?)</tbody>", html, re.I | re.S)
    if not tb:
        return [], lender
    rows: list[dict[str, Any]] = []
    for tr in re.finditer(r"<tr[^>]*>(.*?)</tr>", tb.group(1), re.I | re.S):
        inner = tr.group(1)
        tds = re.findall(r"<td[^>]*>(.*?)</td>", inner, re.I | re.S)
        cells = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", htmlmod.unescape(t))).strip()
            for t in tds
        ]
        if len(cells) < 4:
            continue
        seq_s = re.sub(r"\D", "", cells[0])
        if not seq_s:
            continue
        seq = int(seq_s)
        due = parse_tr_long_date(cells[1]) or parse_date(cells[1])
        amt = money(cells[2])
        paid_amt, paid_date = parse_paid_cell(cells[3])
        plan_guid = None
        gm = re.search(r"([A-F0-9]{32})", inner, re.I)
        if gm:
            plan_guid = gm.group(1).upper()
        if amt <= 0 and not due:
            continue
        rows.append(
            {
                "sequence": seq,
                "due_date": due.isoformat() if due else None,
                "amount": float(amt),
                "paid_amount": float(paid_amt),
                "paid_date": paid_date.isoformat() if paid_date else None,
                "is_paid": paid_amt > 0,
                "plan_guid": plan_guid,
            }
        )
    rows.sort(key=lambda r: r["sequence"])
    return rows, lender


def scrape_live(cache_dir: Path) -> list[dict[str, Any]]:
    card = load_secrets_card()
    user = (os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER") or "").strip()
    password = (
        os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD") or ""
    ).strip()
    if not user or not password:
        raise SystemExit("BIZIMHESAP_USER / BIZIMHESAP_PASSWORD required for --live")

    opener = build_opener()
    login(opener, user, password)

    # Warm Angular session
    req(opener, f"{BASE}/web/ngn/acc/ngncredits")

    st, _, raw = req(opener, f"{ANG_API}/credits/getcredits")
    if st != 200:
        raise SystemExit(f"getcredits failed: HTTP {st}")
    credits = json.loads(raw.decode("utf-8"))
    if not isinstance(credits, list):
        raise SystemExit(f"Unexpected getcredits shape: {type(credits)}")
    safe_print(f"  Credits: {len(credits)}")

    st, _, raw_rem = req(opener, f"{ANG_API}/credits/GetRemainingPayments")
    remaining_total = raw_rem.decode("utf-8").strip().strip('"') if st == 200 else None
    st, _, raw_cur = req(opener, f"{ANG_API}/credits/GetCurrentMonthPayments")
    current_month = raw_cur.decode("utf-8").strip().strip('"') if st == 200 else None
    safe_print(f"  RemainingPayments: {remaining_total} | CurrentMonth: {current_month}")

    loans: list[dict[str, Any]] = []
    for c in credits:
        guid = (c.get("dsGuid") or "").strip().upper()
        if not guid:
            safe_print(f"  skip credit without guid: {c.get('dsCredit')}")
            continue
        # remaining plans (unpaid only) — for reconcile cross-check
        cid = c.get("idCredit")
        remaining_plans: list[dict] = []
        if cid is not None:
            st, _, raw = req(
                opener, f"{ANG_API}/credits/getremainingcreditplans/{cid}"
            )
            if st == 200:
                try:
                    remaining_plans = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    remaining_plans = []

        st, _, raw = req(opener, f"{BASE}/web/ngn/acc/ngncredit?rc=1&guid={guid}")
        html = raw.decode("utf-8", "ignore")
        installments, lender_account = parse_installments_html(html)

        unpaid = sum(
            money(i["amount"]) for i in installments if not i.get("is_paid")
        )
        balance = money(c.get("mtBalance"))
        loans.append(
            {
                "idCredit": cid,
                "dsCredit": decode_html_entities(c.get("dsCredit") or "").strip(),
                "dsGuid": guid,
                "dsNote": decode_html_entities(c.get("dsNote") or "").strip() or None,
                "dsCurrency": c.get("dsCurrency") or "TL",
                "idBankAccount": c.get("idBankAccount"),
                "mtInstallmentCount": c.get("mtInstallmentCount"),
                "dtFirstInstallment": c.get("dtFirstInstallment"),
                "mtPaymentFrequency": c.get("mtPaymentFrequency"),
                "mtCreditTotal": float(money(c.get("mtCreditTotal"))),
                "mtBalance": float(balance),
                "flActive": bool(c.get("flActive", True)),
                "lender_account": lender_account,
                "installments": installments,
                "remaining_plans_count": len(remaining_plans)
                if isinstance(remaining_plans, list)
                else 0,
                "unpaid_sum": float(unpaid),
                "balance_ok": abs(unpaid - balance) < Decimal("0.02"),
            }
        )
        safe_print(
            f"  {loans[-1]['dsCredit']}: {len(installments)} taksit, "
            f"balance={balance} unpaid={unpaid} ok={loans[-1]['balance_ok']}"
        )

        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)
            (cache_dir / f"credit_{guid}.html").write_text(html, encoding="utf-8")
            if remaining_plans:
                (cache_dir / f"remaining_plans_{cid}.json").write_text(
                    json.dumps(remaining_plans, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "credits.json").write_text(
        json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (cache_dir / "loans.json").write_text(
        json.dumps(loans, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    unpaid_all = sum(money(L["unpaid_sum"]) for L in loans)
    manifest = {
        "source": "BizimHesap panel Nakit Yönetimi > Krediler",
        "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "endpoint_list": "/api/AngularControllers/credits/getcredits",
        "endpoint_remaining_plans": "/api/AngularControllers/credits/getremainingcreditplans/{id}",
        "endpoint_detail": "/web/ngn/acc/ngncredit?rc=1&guid={GUID}",
        "endpoint_remaining_total": "/api/AngularControllers/credits/GetRemainingPayments",
        "endpoint_current_month": "/api/AngularControllers/credits/GetCurrentMonthPayments",
        "b2b_api": False,
        "loans_count": len(loans),
        "installments_count": sum(len(L["installments"]) for L in loans),
        "paid_count": sum(
            1 for L in loans for i in L["installments"] if i.get("is_paid")
        ),
        "unpaid_count": sum(
            1 for L in loans for i in L["installments"] if not i.get("is_paid")
        ),
        "bh_remaining_payments": remaining_total,
        "bh_current_month_payments": current_month,
        "sum_unpaid": float(unpaid_all),
        "all_balances_ok": all(L.get("balance_ok") for L in loans),
    }
    (cache_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    safe_print(f"  Cached under {cache_dir}")
    return loans


def load_from_cache(cache_dir: Path) -> list[dict[str, Any]]:
    path = cache_dir / "loans.json"
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise SystemExit(f"Unexpected loans.json shape in {path}")
        return data
    # Rebuild from credits.json + credit_*.html if present
    cpath = cache_dir / "credits.json"
    if not cpath.is_file():
        raise SystemExit(
            f"Missing {path} — run with --live or place scrape export there"
        )
    credits = json.loads(cpath.read_text(encoding="utf-8"))
    loans: list[dict[str, Any]] = []
    for c in credits:
        guid = (c.get("dsGuid") or "").strip().upper()
        html_p = cache_dir / f"credit_{guid}.html"
        if not html_p.is_file():
            safe_print(f"  missing detail HTML for {guid}")
            continue
        installments, lender_account = parse_installments_html(
            html_p.read_text(encoding="utf-8")
        )
        unpaid = sum(money(i["amount"]) for i in installments if not i.get("is_paid"))
        balance = money(c.get("mtBalance"))
        loans.append(
            {
                "idCredit": c.get("idCredit"),
                "dsCredit": decode_html_entities(c.get("dsCredit") or "").strip(),
                "dsGuid": guid,
                "dsNote": decode_html_entities(c.get("dsNote") or "").strip() or None,
                "dsCurrency": c.get("dsCurrency") or "TL",
                "idBankAccount": c.get("idBankAccount"),
                "mtInstallmentCount": c.get("mtInstallmentCount"),
                "dtFirstInstallment": c.get("dtFirstInstallment"),
                "mtPaymentFrequency": c.get("mtPaymentFrequency"),
                "mtCreditTotal": float(money(c.get("mtCreditTotal"))),
                "mtBalance": float(balance),
                "flActive": bool(c.get("flActive", True)),
                "lender_account": lender_account,
                "installments": installments,
                "unpaid_sum": float(unpaid),
                "balance_ok": abs(unpaid - balance) < Decimal("0.02"),
            }
        )
    return loans


def match_bank(db, lender_account: str | None, BankAccount) -> int | None:
    if not lender_account:
        return None
    needle = lender_account.casefold()
    banks = db.query(BankAccount).all()
    for b in banks:
        if b.name and (
            b.name.casefold() == needle
            or needle in b.name.casefold()
            or b.name.casefold() in needle
        ):
            return b.id
    for b in banks:
        if b.institution and needle in (b.institution or "").casefold():
            return b.id
    return None


def run_import(loans: list[dict[str, Any]], *, dry_run: bool) -> dict[str, Any]:
    from sqlalchemy.orm import sessionmaker

    from app.db.session import engine
    from app.models.finance import BankAccount
    from app.models.loan import Loan, LoanInstallment

    Session = sessionmaker(bind=engine)
    db = Session()
    stats: dict[str, Any] = {
        "bh_loans": len(loans),
        "bh_installments": sum(len(L.get("installments") or []) for L in loans),
        "loans_deleted": 0,
        "installments_deleted": 0,
        "loans_created": 0,
        "installments_created": 0,
        "installments_paid": 0,
        "installments_unpaid": 0,
        "bank_matched": 0,
        "balance_mismatch": [],
        "by_loan": {},
        "sum_principal": "0.00",
        "sum_remaining": "0.00",
        "sum_paid": "0.00",
    }
    try:
        n_inst = db.query(LoanInstallment).count()
        n_loan = db.query(Loan).count()
        if not dry_run:
            db.query(LoanInstallment).delete()
            db.query(Loan).delete()
            db.commit()
        stats["installments_deleted"] = n_inst
        stats["loans_deleted"] = n_loan
        safe_print(f"  Wiped {n_loan} loans + {n_inst} installments")

        sum_principal = Decimal("0.00")
        sum_remaining = Decimal("0.00")
        sum_paid = Decimal("0.00")

        for src in loans:
            title = decode_html_entities(src.get("dsCredit") or "").strip()
            if not title:
                continue
            guid = (src.get("dsGuid") or "").strip().upper()
            principal = money(src.get("mtCreditTotal"))
            if principal <= 0:
                continue
            start = parse_date(src.get("dtFirstInstallment")) or date.today()
            installments = src.get("installments") or []
            inst_count = len(installments) or int(src.get("mtInstallmentCount") or 1)
            balance = money(src.get("mtBalance"))
            unpaid_sum = money(src.get("unpaid_sum"))
            if src.get("unpaid_sum") is None and installments:
                unpaid_sum = sum(
                    money(i["amount"]) for i in installments if not i.get("is_paid")
                )
            if abs(unpaid_sum - balance) >= Decimal("0.02"):
                stats["balance_mismatch"].append(
                    {
                        "title": title,
                        "mtBalance": float(balance),
                        "unpaid_sum": float(unpaid_sum),
                    }
                )

            lender = decode_html_entities(src.get("lender_account") or "").strip()
            if not lender or lender.casefold() in ("banka tl hesabı", "banka tl hesabi"):
                # Prefer credit name as lender when account label is generic
                lender = title
            status = "aktif"
            if not src.get("flActive", True) or balance <= 0:
                status = "kapandı" if balance <= 0 else "aktif"

            note_parts = []
            if src.get("dsNote"):
                note_parts.append(decode_html_entities(src["dsNote"]).strip())
            if guid:
                note_parts.append(f"{BH_NOTE_PREFIX}{guid}")
            if src.get("idCredit") is not None:
                note_parts.append(f"BH-ID:{src['idCredit']}")
            notes = " | ".join(p for p in note_parts if p) or None

            bank_id = None
            if not dry_run:
                bank_id = match_bank(db, src.get("lender_account"), BankAccount)
                if bank_id:
                    stats["bank_matched"] += 1

            loan = Loan(
                title=title[:200],
                lender=(lender[:150] if lender else None),
                principal_amount=principal,
                interest_rate=None,
                start_date=start,
                installment_count=inst_count,
                status=status,
                notes=notes,
            )
            if not dry_run:
                db.add(loan)
                db.flush()
            stats["loans_created"] += 1
            sum_principal += principal

            paid_n = unpaid_n = 0
            loan_paid = Decimal("0.00")
            loan_remaining = Decimal("0.00")
            for inst in installments:
                due = parse_date(inst.get("due_date"))
                if not due:
                    continue
                amt = money(inst.get("amount"))
                is_paid = bool(inst.get("is_paid"))
                paid_at = None
                if is_paid:
                    pd = parse_date(inst.get("paid_date"))
                    paid_at = (
                        datetime.combine(pd, datetime.min.time())
                        if pd
                        else datetime.utcnow()
                    )
                    paid_n += 1
                    loan_paid += amt
                else:
                    unpaid_n += 1
                    loan_remaining += amt

                plan_note = None
                if inst.get("plan_guid"):
                    plan_note = f"{BH_PLAN_PREFIX}{inst['plan_guid']}"

                row = LoanInstallment(
                    loan_id=loan.id if not dry_run else 0,
                    sequence=int(inst.get("sequence") or 1),
                    due_date=due,
                    amount=amt,
                    is_paid=is_paid,
                    paid_at=paid_at,
                    payment_method="banka" if is_paid else None,
                    bank_account_id=bank_id if is_paid else None,
                    notes=plan_note,
                )
                if not dry_run:
                    db.add(row)
                stats["installments_created"] += 1

            stats["installments_paid"] += paid_n
            stats["installments_unpaid"] += unpaid_n
            sum_paid += loan_paid
            sum_remaining += loan_remaining
            stats["by_loan"][title] = {
                "installments": len(installments),
                "paid": paid_n,
                "unpaid": unpaid_n,
                "principal": float(principal),
                "remaining": float(loan_remaining),
                "bh_balance": float(balance),
                "status": status,
            }

        if not dry_run:
            db.commit()
        stats["sum_principal"] = str(sum_principal)
        stats["sum_remaining"] = str(sum_remaining)
        stats["sum_paid"] = str(sum_paid)
        safe_print(
            f"  Created {stats['loans_created']} loans / "
            f"{stats['installments_created']} installments "
            f"(paid={stats['installments_paid']} unpaid={stats['installments_unpaid']})"
        )
        return stats
    finally:
        db.close()


def resolve_sqlite_path() -> Path:
    url = os.environ.get("DATABASE_URL") or "sqlite:///./baykus.db"
    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///") :]
        p = Path(raw)
        if not p.is_absolute():
            p = (API_ROOT / p).resolve()
        return p
    return API_ROOT / "baykus.db"


def main() -> None:
    ap = argparse.ArgumentParser(description="Import BizimHesap krediler into Baykuş")
    ap.add_argument("--from-cache", type=str, default=None, help="Cache dir with loans.json")
    ap.add_argument("--live", action="store_true", help="Scrape BH panel then import")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-backup", action="store_true")
    ap.add_argument(
        "--scrape-only",
        action="store_true",
        help="Only scrape/cache; do not write DB",
    )
    args = ap.parse_args()

    cache_dir = Path(args.from_cache) if args.from_cache else DEFAULT_CACHE
    if not cache_dir.is_absolute():
        cache_dir = (API_ROOT / cache_dir).resolve()

    safe_print("=== BizimHesap Krediler → Baykuş ===")
    db_path = resolve_sqlite_path()
    safe_print(f"DB: {db_path}")

    if args.live or args.scrape_only:
        loans = scrape_live(cache_dir)
    else:
        loans = load_from_cache(cache_dir)
    n_inst = sum(len(L.get("installments") or []) for L in loans)
    safe_print(f"Source: {len(loans)} loans, {n_inst} installments")

    if args.scrape_only:
        safe_print("(scrape-only: no DB writes)")
        return

    if not args.skip_backup and not args.dry_run:
        bak = backup_db(db_path)
        if bak:
            safe_print(f"Backup: {bak}")

    stats = run_import(loans, dry_run=args.dry_run)
    safe_print("--- summary ---")
    safe_print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    if args.dry_run:
        safe_print("(dry-run: no DB writes)")


if __name__ == "__main__":
    main()
