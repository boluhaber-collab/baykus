#!/usr/bin/env python3
"""BizimHesap Masraflar → Baykuş expense_categories + expenses.

B2B API has NO masraf endpoint. Source: panel Nakit Yönetimi > Masraflar:
  GET /web/ngn/acc/ngncosts          — list (date, category, amount, pay, status, note, guid)
  GET /web/ngn/acc/ngncostitems      — masraf kalemleri (groups + sub-accounts)
  GET /web/ngn/acc/ngncostentry?rc=1&guid={GUID}  — detail (optional --enrich)

Cached export (gitignore):
  tmp/bizimhesap/masraflar/expenses.json
  tmp/bizimhesap/masraflar/categories.json
  tmp/bizimhesap/masraflar/manifest.json

Usage (from apps/api, venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/import_bizimhesap_masraflar.py --live
  python scripts/import_bizimhesap_masraflar.py --from-cache ../../tmp/bizimhesap/masraflar
  python -m app.scripts.import_bizimhesap_masraflar
  python scripts/import_bizimhesap_masraflar.py --dry-run

Wipe / import policy:
  - BACKUP baykus.db
  - Delete ALL expenses then expense_categories (seed demo + prior BH)
  - Insert BH categories (group_name + name)
  - Insert BH expenses as is_posted=True WITHOUT new cash/bank movements
    (Hesaplarım import already owns ledger movements — avoid double-count)
  - note carries BH_IMPORT:BH-COST:{guid}
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
BH_NOTE_PREFIX = "BH_IMPORT:BH-COST:"
DEFAULT_CACHE = Path("../../tmp/bizimhesap/masraflar")
BASE = "https://uygulama.bizimhesap.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

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
    return None


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
    dest = bak_dir / f"baykus_pre_bh_masraflar_{stamp}.db"
    shutil.copy2(db_path, dest)
    return dest


def map_payment(bh_pay: str) -> str:
    p = (bh_pay or "").strip().casefold()
    if p in ("nakit", "kasa"):
        return "nakit"
    return "banka"


def split_group_item(label: str) -> tuple[str, str]:
    """'Mali Giderler / Banka Masrafları' → (group, item)."""
    s = decode_html_entities(label or "").strip()
    if " / " in s:
        g, n = s.split(" / ", 1)
        return g.strip(), n.strip()
    if "/" in s and " / " not in s:
        # note style: Mali Giderler/Banka Masrafları
        g, n = s.split("/", 1)
        return g.strip(), n.strip()
    return "İşletme Giderleri", s or "Diğer"


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


def parse_categories_html(html: str) -> list[dict[str, Any]]:
    """Parse ngncostitems panels OR ddlCostAccounts optgroups."""
    cats: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Prefer panel EditSubAccount links
    for m in re.finditer(
        r"EditSubAccount\(\s*'(\d+)'\s*,\s*'(\d+)'\s*,\s*'([^']*)'\s*\)",
        html,
    ):
        group_id, item_id, name = m.group(1), m.group(2), htmlmod.unescape(m.group(3)).strip()
        # find group name from EditMainAccount nearby or prior
        group_name = None
        # search backward for EditMainAccount with same group id
        window = html[max(0, m.start() - 2500) : m.start()]
        gm = re.search(
            rf"EditMainAccount\(\s*'{group_id}'\s*,\s*'([^']*)'\s*\)",
            window,
        )
        if gm:
            group_name = htmlmod.unescape(gm.group(1)).strip()
        if not group_name:
            group_name = "İşletme Giderleri"
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        cats.append(
            {
                "bh_id": item_id,
                "bh_group_id": group_id,
                "name": name,
                "group_name": group_name,
            }
        )

    if cats:
        return cats

    # Fallback: optgroups in any select
    for og in re.finditer(
        r'<optgroup[^>]*label="([^"]+)"[^>]*>(.*?)</optgroup>', html, re.I | re.S
    ):
        group_name = htmlmod.unescape(og.group(1)).strip()
        for a, b in re.findall(
            r'<option[^>]*value="([^"]*)"[^>]*>([^<]+)</option>', og.group(2), re.I
        ):
            name = htmlmod.unescape(b).strip()
            key = name.casefold()
            if not name or key in seen:
                continue
            seen.add(key)
            cats.append(
                {
                    "bh_id": a,
                    "bh_group_id": None,
                    "name": name,
                    "group_name": group_name,
                }
            )
    return cats


def parse_expenses_list_html(html: str) -> list[dict[str, Any]]:
    tb = re.search(r"<tbody[^>]*>(.*?)</tbody>", html, re.I | re.S)
    tbody = tb.group(1) if tb else html
    rows: list[dict[str, Any]] = []
    for tr in re.finditer(r"<tr[^>]*>(.*?)</tr>", tbody, re.I | re.S):
        inner = tr.group(1)
        guid_m = re.search(
            r"hdnIdTransaction2'\)\.val\('([A-F0-9]{32})'\)", inner, re.I
        ) or re.search(r"guid=([A-F0-9]{32})", inner, re.I)
        if not guid_m:
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", inner, re.I | re.S)
        cells = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", htmlmod.unescape(t))).strip()
            for t in tds
        ]
        if len(cells) < 7:
            continue
        # '', date(vade), Masraf Hesabı, Tutar, Ödeme, Durum, Not, ...
        due_s = cells[1]
        cat_label = cells[2]
        amount_s = cells[3]
        pay_s = cells[4]
        status_s = cells[5]
        note_s = cells[6]
        group_name, cat_name = split_group_item(cat_label)
        d = parse_date(due_s)
        amt = money(amount_s)
        if amt <= 0 or not d:
            continue
        guid = guid_m.group(1).upper()
        rows.append(
            {
                "guid": guid,
                "expense_date": d.isoformat(),
                "due_date": d.isoformat(),
                "category_name": cat_name,
                "group_name": group_name,
                "amount": float(amt),
                "payment_bh": pay_s,
                "payment_method": map_payment(pay_s),
                "status": status_s,
                "note": note_s or None,
                "document_no": None,
                "cashier": None,
                "is_paid": status_s.strip().casefold() in ("ödenmiş", "odenmis", "ödendi", "odendi"),
            }
        )
    return rows


def parse_entry_detail(html: str, guid: str) -> dict[str, Any]:
    fields: dict[str, str] = {}
    for inp in re.findall(r"<input[^>]+>", html, re.I):
        nm = re.search(r'\bname="([^"]+)"', inp) or re.search(r'\bid="([^"]+)"', inp)
        if not nm or nm.group(1).startswith("__"):
            continue
        typ_m = re.search(r'\btype="([^"]+)"', inp)
        typ = (typ_m.group(1) if typ_m else "text").lower()
        if typ in ("submit", "button", "file", "checkbox", "hidden"):
            # keep some hiddens? skip
            if typ == "hidden":
                continue
            continue
        val_m = re.search(r'\bvalue="([^"]*)"', inp)
        fields[nm.group(1)] = htmlmod.unescape(val_m.group(1)) if val_m else ""
    for m in re.finditer(
        r'<select[^>]*(?:name|id)="([^"]+)"[^>]*>(.*?)</select>', html, re.I | re.S
    ):
        name, inner = m.group(1), m.group(2)
        sm = re.search(
            r'<option[^>]*selected[^>]*>([^<]*)</option>', inner, re.I
        ) or re.search(
            r'<option[^>]*selected="selected"[^>]*>([^<]*)</option>', inner, re.I
        )
        if sm:
            fields[name + "_selected"] = htmlmod.unescape(sm.group(1)).strip()
    ta = re.search(
        r'<textarea[^>]*(?:name|id)="txtNote"[^>]*>(.*?)</textarea>', html, re.I | re.S
    )
    note = htmlmod.unescape(ta.group(1)).strip() if ta else fields.get("txtNote") or ""
    cashier = fields.get("ddlCashierNew_selected") or ""
    # strip balance suffix: 'AKBANK (1.582,93 TL)'
    cashier_name = re.sub(r"\s*\([^)]*\)\s*$", "", cashier).strip()
    cat = fields.get("ddlCostAccounts_selected") or ""
    pay_opt = fields.get("ddlPaymentOption_selected") or ""
    amount = money(fields.get("txtAmount"))
    doc_date = parse_date(fields.get("txtDocumentDate"))
    due_date = parse_date(fields.get("txtDueDate")) or doc_date
    doc_no = (fields.get("txtDocumentNo") or "").strip() or None
    return {
        "guid": guid.upper(),
        "expense_date": (doc_date or due_date or date.today()).isoformat(),
        "due_date": (due_date or doc_date).isoformat() if (due_date or doc_date) else None,
        "category_name": cat,
        "group_name": None,  # filled later from categories map
        "amount": float(amount),
        "payment_bh": None,
        "payment_method": "nakit" if "kasa" in cashier_name.casefold() or "nakit" in cashier_name.casefold() else "banka",
        "status": pay_opt,
        "note": note or None,
        "document_no": doc_no,
        "cashier": cashier_name or None,
        "is_paid": pay_opt.strip().casefold() in ("ödendi", "odendi", "ödenmiş", "odenmis"),
    }


def scrape_live(cache_dir: Path, enrich: bool = False) -> tuple[list[dict], list[dict]]:
    card = load_secrets_card()
    user = (os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER") or "").strip()
    password = (
        os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD") or ""
    ).strip()
    if not user or not password:
        raise SystemExit("BIZIMHESAP_USER / BIZIMHESAP_PASSWORD required for --live")

    opener = build_opener()
    login(opener, user, password)

    st, _, raw = req(opener, f"{BASE}/web/ngn/acc/ngncostitems")
    items_html = raw.decode("utf-8", "ignore")
    categories = parse_categories_html(items_html)
    safe_print(f"  Categories: {len(categories)}")

    st, _, raw = req(opener, f"{BASE}/web/ngn/acc/ngncosts")
    costs_html = raw.decode("utf-8", "ignore")
    expenses = parse_expenses_list_html(costs_html)
    safe_print(f"  Expenses (list): {len(expenses)}")

    # Fill group from categories when category_name matches
    cat_group = {c["name"].casefold(): c["group_name"] for c in categories}
    for e in expenses:
        if not e.get("group_name") or e["group_name"] == "İşletme Giderleri":
            g = cat_group.get((e.get("category_name") or "").casefold())
            if g:
                e["group_name"] = g

    if enrich:
        safe_print(f"  Enriching {len(expenses)} detail pages…")
        for i, e in enumerate(expenses):
            guid = e["guid"]
            st, _, raw = req(opener, f"{BASE}/web/ngn/acc/ngncostentry?rc=1&guid={guid}")
            detail = parse_entry_detail(raw.decode("utf-8", "ignore"), guid)
            if detail.get("amount") and detail["amount"] > 0:
                e["expense_date"] = detail["expense_date"]
                e["due_date"] = detail.get("due_date") or e.get("due_date")
                e["document_no"] = detail.get("document_no")
                e["cashier"] = detail.get("cashier")
                if detail.get("category_name"):
                    e["category_name"] = detail["category_name"]
                    g = cat_group.get(detail["category_name"].casefold())
                    if g:
                        e["group_name"] = g
                if detail.get("note"):
                    e["note"] = detail["note"]
                # refine payment from cashier
                if detail.get("cashier"):
                    cn = detail["cashier"].casefold()
                    if "kasa" in cn or cn.startswith("tl kasa"):
                        e["payment_method"] = "nakit"
                        e["payment_bh"] = "Nakit"
                    else:
                        e["payment_method"] = "banka"
            if (i + 1) % 50 == 0:
                safe_print(f"    … {i + 1}/{len(expenses)}")

    # Ensure categories cover every expense category_name
    have = {c["name"].casefold() for c in categories}
    for e in expenses:
        n = (e.get("category_name") or "").strip()
        if n and n.casefold() not in have:
            categories.append(
                {
                    "bh_id": None,
                    "bh_group_id": None,
                    "name": n,
                    "group_name": e.get("group_name") or "İşletme Giderleri",
                }
            )
            have.add(n.casefold())

    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "_page_ngncosts.html").write_text(costs_html, encoding="utf-8")
    (cache_dir / "_page_ngncostitems.html").write_text(items_html, encoding="utf-8")
    (cache_dir / "categories.json").write_text(
        json.dumps(categories, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (cache_dir / "expenses.json").write_text(
        json.dumps(expenses, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    manifest = {
        "source": "BizimHesap panel Nakit Yönetimi > Masraflar",
        "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "endpoint_list": "/web/ngn/acc/ngncosts",
        "endpoint_items": "/web/ngn/acc/ngncostitems",
        "endpoint_detail": "/web/ngn/acc/ngncostentry?rc=1&guid={GUID}",
        "b2b_api": False,
        "enriched": enrich,
        "categories_count": len(categories),
        "expenses_count": len(expenses),
    }
    (cache_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    safe_print(f"  Cached under {cache_dir}")
    return categories, expenses


def load_from_cache(cache_dir: Path) -> tuple[list[dict], list[dict]]:
    cpath = cache_dir / "categories.json"
    epath = cache_dir / "expenses.json"
    if not epath.is_file():
        # try parse raw HTML if present
        html_costs = cache_dir / "_page_web_ngn_acc_ngncosts.html"
        html_items = cache_dir / "_page_web_ngn_acc_ngncostitems.html"
        alt_costs = cache_dir / "_page_ngncosts.html"
        alt_items = cache_dir / "_page_ngncostitems.html"
        costs_p = html_costs if html_costs.is_file() else alt_costs
        items_p = html_items if html_items.is_file() else alt_items
        if costs_p.is_file():
            expenses = parse_expenses_list_html(costs_p.read_text(encoding="utf-8"))
            categories = (
                parse_categories_html(items_p.read_text(encoding="utf-8"))
                if items_p.is_file()
                else []
            )
            if not categories:
                # derive from expenses
                seen: set[str] = set()
                for e in expenses:
                    n = e.get("category_name") or ""
                    if n and n.casefold() not in seen:
                        seen.add(n.casefold())
                        categories.append(
                            {
                                "bh_id": None,
                                "name": n,
                                "group_name": e.get("group_name") or "İşletme Giderleri",
                            }
                        )
            return categories, expenses
        raise SystemExit(
            f"Missing {epath} — run with --live or place scrape export there"
        )
    categories = json.loads(cpath.read_text(encoding="utf-8")) if cpath.is_file() else []
    expenses = json.loads(epath.read_text(encoding="utf-8"))
    if not isinstance(expenses, list):
        raise SystemExit(f"Unexpected expenses.json shape in {epath}")
    if not categories:
        seen = set()
        for e in expenses:
            n = e.get("category_name") or ""
            if n and n.casefold() not in seen:
                seen.add(n.casefold())
                categories.append(
                    {
                        "bh_id": None,
                        "name": n,
                        "group_name": e.get("group_name") or "İşletme Giderleri",
                    }
                )
    return categories, expenses


def match_account(
    db,
    payment_method: str,
    cashier: str | None,
    CashRegister,
    BankAccount,
) -> tuple[int | None, int | None]:
    """Return (cash_register_id, bank_account_id)."""
    if payment_method == "nakit":
        reg = db.query(CashRegister).filter(CashRegister.is_active.is_(True)).first()
        if cashier:
            for r in db.query(CashRegister).all():
                if r.name and cashier.casefold() in r.name.casefold():
                    return r.id, None
        return (reg.id if reg else None), None

    if cashier:
        needle = cashier.casefold()
        banks = db.query(BankAccount).all()
        # exact / contains on name
        for b in banks:
            if b.name and (
                b.name.casefold() == needle or needle in b.name.casefold() or b.name.casefold() in needle
            ):
                return None, b.id
        # credit card short numbers like 6972 / 0083
        digits = re.sub(r"\D", "", cashier)
        if digits:
            for b in banks:
                if b.name and digits in re.sub(r"\D", "", b.name):
                    return None, b.id
        for b in banks:
            if b.institution and needle in (b.institution or "").casefold():
                return None, b.id
    return None, None


def run_import(
    categories: list[dict[str, Any]],
    expenses: list[dict[str, Any]],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    from sqlalchemy.orm import sessionmaker

    from app.db.session import engine
    from app.models.expense import Expense, ExpenseCategory
    from app.models.finance import BankAccount, CashRegister

    Session = sessionmaker(bind=engine)
    db = Session()
    stats: dict[str, Any] = {
        "bh_categories": len(categories),
        "bh_expenses": len(expenses),
        "categories_deleted": 0,
        "expenses_deleted": 0,
        "categories_created": 0,
        "expenses_created": 0,
        "expenses_skipped": 0,
        "by_group": {},
        "by_payment": {},
        "matched_cash": 0,
        "matched_bank": 0,
    }
    try:
        n_exp = db.query(Expense).count()
        n_cat = db.query(ExpenseCategory).count()
        if not dry_run:
            db.query(Expense).delete()
            db.query(ExpenseCategory).delete()
            db.commit()
        stats["expenses_deleted"] = n_exp
        stats["categories_deleted"] = n_cat
        safe_print(f"  Wiped {n_exp} expenses + {n_cat} categories")

        cat_id_by_name: dict[str, int] = {}
        for src in categories:
            name = decode_html_entities(src.get("name") or "").strip()
            if not name:
                continue
            group = decode_html_entities(src.get("group_name") or "İşletme Giderleri").strip()
            row = ExpenseCategory(
                name=name[:100],
                group_name=group[:100] if group else "İşletme Giderleri",
                description=f"BH:{src.get('bh_id')}" if src.get("bh_id") else "BH_IMPORT",
                is_active=True,
            )
            if not dry_run:
                db.add(row)
                db.flush()
                cat_id_by_name[name.casefold()] = row.id
            else:
                cat_id_by_name[name.casefold()] = -1 * (stats["categories_created"] + 1)
            stats["categories_created"] += 1
            stats["by_group"][group] = stats["by_group"].get(group, 0) + 1
        if not dry_run:
            db.commit()
        safe_print(f"  Categories created: {stats['categories_created']}")

        for src in expenses:
            cname = decode_html_entities(src.get("category_name") or "").strip()
            if not cname:
                stats["expenses_skipped"] += 1
                continue
            cid = cat_id_by_name.get(cname.casefold())
            if cid is None:
                # create on the fly
                group = decode_html_entities(
                    src.get("group_name") or "İşletme Giderleri"
                ).strip()
                row = ExpenseCategory(
                    name=cname[:100],
                    group_name=group[:100],
                    description="BH_IMPORT",
                    is_active=True,
                )
                if not dry_run:
                    db.add(row)
                    db.flush()
                    cid = row.id
                else:
                    cid = -999
                cat_id_by_name[cname.casefold()] = cid
                stats["categories_created"] += 1

            amt = money(src.get("amount"))
            if amt <= 0:
                stats["expenses_skipped"] += 1
                continue
            ed = parse_date(src.get("expense_date"))
            if not ed:
                stats["expenses_skipped"] += 1
                continue
            dd = parse_date(src.get("due_date"))
            pay = src.get("payment_method") or map_payment(src.get("payment_bh") or "")
            if pay not in ("nakit", "banka"):
                pay = "banka"
            guid = (src.get("guid") or "").strip().upper()
            raw_note = decode_html_entities(src.get("note") or "").strip()
            # Avoid duplicating category path as note when it's just Group/Item
            if raw_note and ("/" in raw_note) and cname.casefold() in raw_note.casefold():
                # keep shorter user notes only if different from category path
                g = src.get("group_name") or ""
                if raw_note.replace(" ", "") in {
                    f"{g}/{cname}".replace(" ", ""),
                    f"{g} / {cname}".replace(" ", ""),
                }:
                    raw_note = ""
            note_parts = []
            if raw_note:
                note_parts.append(raw_note)
            if guid:
                note_parts.append(f"{BH_NOTE_PREFIX}{guid}")
            note = " | ".join(note_parts) if note_parts else (f"{BH_NOTE_PREFIX}{guid}" if guid else None)

            cash_id, bank_id = None, None
            if not dry_run:
                cash_id, bank_id = match_account(
                    db, pay, src.get("cashier"), CashRegister, BankAccount
                )
                if cash_id:
                    stats["matched_cash"] += 1
                if bank_id:
                    stats["matched_bank"] += 1

            is_paid = bool(src.get("is_paid", True))
            exp = Expense(
                category_id=cid if not dry_run else (cid if cid > 0 else 1),
                amount=amt,
                expense_date=ed,
                due_date=dd,
                document_no=(str(src["document_no"]).strip()[:50] if src.get("document_no") else None),
                payment_method=pay,
                note=note,
                cash_register_id=cash_id,
                bank_account_id=bank_id,
                is_posted=is_paid,  # no new ledger rows — Hesaplarım owns movements
                created_by_user_id=None,
            )
            if not dry_run:
                db.add(exp)
            stats["expenses_created"] += 1
            stats["by_payment"][pay] = stats["by_payment"].get(pay, 0) + 1

        if not dry_run:
            db.commit()
        safe_print(f"  Expenses created: {stats['expenses_created']}")
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
    ap = argparse.ArgumentParser(description="Import BizimHesap masraflar into Baykuş")
    ap.add_argument("--from-cache", type=str, default=None, help="Cache dir with expenses.json")
    ap.add_argument("--live", action="store_true", help="Scrape BH panel then import")
    ap.add_argument(
        "--enrich",
        action="store_true",
        help="With --live, fetch each ngncostentry for cashier/document_no (slower)",
    )
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

    safe_print("=== BizimHesap Masraflar → Baykuş ===")
    db_path = resolve_sqlite_path()
    safe_print(f"DB: {db_path}")

    if args.live or args.scrape_only:
        categories, expenses = scrape_live(cache_dir, enrich=args.enrich)
    else:
        categories, expenses = load_from_cache(cache_dir)
    safe_print(f"Source: {len(categories)} categories, {len(expenses)} expenses")

    if args.scrape_only:
        safe_print("(scrape-only: no DB writes)")
        return

    if not args.skip_backup and not args.dry_run:
        bak = backup_db(db_path)
        if bak:
            safe_print(f"Backup: {bak}")

    stats = run_import(categories, expenses, dry_run=args.dry_run)
    safe_print("--- summary ---")
    safe_print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    if args.dry_run:
        safe_print("(dry-run: no DB writes)")


if __name__ == "__main__":
    main()
