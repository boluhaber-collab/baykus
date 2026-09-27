#!/usr/bin/env python3
"""Live scrape BizimHesap Hesaplarım via GetCashTrx → tmp/bizimhesap/hesaplarim/."""
from __future__ import annotations

import argparse
import html as htmlmod
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlencode

from openpyxl import Workbook

BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
BASE = "https://uygulama.bizimhesap.com"

# Institution / display-name mapping (must match import_bizimhesap_hesaplar display keys)
ACCOUNT_META = {
    "39649590B0464F15A6F7CF8711CB8F7C": {
        "account_type": "Kasa",
        "institution": None,
        "name": "TL Kasa",
        "xlsx_name": "TL Kasa",
    },
    "C29CE22BA1864B96ADE46ED6C2CF8A0B": {
        "account_type": "POS",
        "institution": "BAYKUSBASKI.COM",
        "name": "BAYKUŞ.COM",
        "xlsx_name": "BAYKUŞ.COM",
    },
    "C1ECDF438BFA4D6487478E1EA90F57E1": {
        "account_type": "POS",
        "institution": "POS",
        "name": "POS Hesabı",
        "xlsx_name": "POS Hesabı",
    },
    "B139B48B0194446888B01C2F1B91DEA8": {
        "account_type": "Kredi Kartı",
        "institution": "VakıfBank",
        "name": "Vafıkbank (6972)",
        "xlsx_name": "6972",
    },
    "2F1EAC1FA6FB4C1CBAA1FD3D47E053D4": {
        "account_type": "Kredi Kartı",
        "institution": "VakıfBank",
        "name": "Vakıfbank (0083)",
        "xlsx_name": "0083",
    },
    "7A90FACCD464477D8902EB63A7E3371B": {
        "account_type": "Banka",
        "institution": "Akbank",
        "name": "AKBANK",
        "xlsx_name": "AKBANK",
    },
    "91750144E1DB4229AF00C4CD8D5D8383": {
        "account_type": "Banka",
        "institution": "Garanti Bankası",
        "name": "Garanti Bankası",
        "xlsx_name": "Garanti Bankası",
    },
    "6DD729E5819A40188297B0F4954F0C69": {
        "account_type": "Banka",
        "institution": "QNB",
        "name": "QNB KREDİ HESABI",
        "xlsx_name": "QNB KREDİ HESABI",
    },
    "AC242831593C4D0C9C4DC2CF261E9046": {
        "account_type": "Banka",
        "institution": "VakıfBank",
        "name": "VAKIFBANK",
        "xlsx_name": "VAKIFBANK",
    },
    "1B8F52C8E30D4787A70B7A6DEE6085A7": {
        "account_type": "Şirket Ortağı",
        "institution": "Şirket Ortakları",
        "name": "ENGİN",
        "xlsx_name": "Engin KARAGÖZ",
    },
    "B2D4171C0BA4423985328C0666D2D88C": {
        "account_type": "Şirket Ortağı",
        "institution": "Şirket Ortakları",
        "name": "NEVİN",
        "xlsx_name": "Nevin KARAGÖZ",
    },
    "448F8BAF831543EB87933633E78CB8AB": {
        "account_type": "Banka",
        "institution": "Fon",
        "name": "FON HESABI",
        "xlsx_name": "FON HESABI",
    },
    "A2A118922B464BA496BE68A7FBE3DC83": {
        "account_type": "Banka",
        "institution": "Banka TL",
        "name": "Banka TL Hesabı",
        "xlsx_name": "Banka TL Hesabı",
    },
    # OOS — hidden on UI, keep listed for completeness but skip import by default
    "30ADEB0989BF405080D8B551EAA08364": {
        "account_type": "Banka",
        "institution": "Banka EUR",
        "name": "Banka EUR Hesabı",
        "xlsx_name": "Banka EUR Hesabı",
        "oos": True,
    },
}


def money(val) -> Decimal:
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


def load_secrets_card() -> dict:
    if not BOX_SECRETS.is_file():
        return {}
    data = json.loads(BOX_SECRETS.read_text(encoding="utf-8"))
    card = data.get("card") if isinstance(data, dict) else {}
    return card if isinstance(card, dict) else {}


def build_opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj


def req(opener, url: str, data: dict | None = None, form: bool = False, json_body=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "tr-TR,tr;q=0.9"}
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode()
        h["Content-Type"] = "application/json; charset=utf-8"
    elif data is not None:
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
    st, final, raw = req(opener, f"{BASE}/bhlogin", data=payload, form=True)
    if "newportal" not in final and "ngn" not in final:
        raise SystemExit(f"BH login failed (landed on {final})")
    print(f"  Logged in -> {final}", flush=True)


def parse_accounts_page(html: str) -> dict[str, dict]:
    """Return guid -> {name, currency, balance_str, balance, section} from ngnaccounts."""
    out: dict[str, dict] = {}
    # Section detection via nearby headings
    sections = []
    for m in re.finditer(
        r"(Kasa Tanımları|POS Hesapları|Kredi Kartları|Banka Hesapları|Şirket Ortakları Hesapları|Çalışanlar)",
        html,
    ):
        sections.append((m.start(), m.group(1)))
    sections.append((len(html), "END"))

    def section_at(pos: int) -> str:
        cur = "Unknown"
        for i in range(len(sections) - 1):
            if sections[i][0] <= pos < sections[i + 1][0]:
                cur = sections[i][1]
                break
        return cur

    type_map = {
        "Kasa Tanımları": "Kasa",
        "POS Hesapları": "POS",
        "Kredi Kartları": "Kredi Kartı",
        "Banka Hesapları": "Banka",
        "Şirket Ortakları Hesapları": "Şirket Ortağı",
        "Çalışanlar": "Çalışan",
    }

    for m in re.finditer(
        r'href="ngnaccount\?rc=1&guid=([A-F0-9]{32})"[^>]*>.*?</a>',
        html,
        re.I | re.S,
    ):
        guid = m.group(1).upper()
        # walk backward/forward for name + balance in table row
        # Find enclosing row-ish block
        start = max(0, m.start() - 800)
        end = min(len(html), m.end() + 200)
        block = html[start:end]
        # Prefer text near the link: name appears before balance often as plain text
        # Pattern from prior scrape: NAME | TL | BALANCE near the link
        text = re.sub(r"<[^>]+>", " ", block)
        text = htmlmod.unescape(re.sub(r"\s+", " ", text))
        # Try to find balance like -40.202,82 or 402,06 near end
        bal_m = re.search(r"(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:TL)?\s*$", text.strip())
        # Better: find all money amounts and name tokens
        # Look for pattern: NAME  TL  BALANCE immediately before/around guid link area
        # Extract from the smaller window around the anchor
        small = html[max(0, m.start() - 350) : min(len(html), m.end() + 250)]
        small_t = htmlmod.unescape(re.sub(r"<[^>]+>", "|", small))
        small_t = re.sub(r"\|+", "|", small_t)
        # split tokens
        parts = [p.strip() for p in small_t.split("|") if p.strip()]
        name = None
        currency = "TL"
        balance_str = None
        for i, p in enumerate(parts):
            if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})*,\d{2}", p) or re.fullmatch(
                r"-?\d+,\d{2}", p
            ):
                # look back for TL and name
                balance_str = p
                if i >= 1 and parts[i - 1] in ("TL", "USD", "EUR", "GBP"):
                    currency = parts[i - 1]
                    if i >= 2:
                        name = parts[i - 2]
                elif i >= 1:
                    name = parts[i - 1]
                break
        sec = section_at(m.start())
        atype = type_map.get(sec, ACCOUNT_META.get(guid, {}).get("account_type", "Banka"))
        if not name:
            name = ACCOUNT_META.get(guid, {}).get("name", guid)
        if not balance_str:
            balance_str = "0,00"
        out[guid] = {
            "guid": guid,
            "name": name,
            "currency": currency,
            "balance_str": balance_str,
            "balance": float(money(balance_str)),
            "account_type": atype,
            "section": sec,
        }
    return out


def get_cash_trx(opener, guid: str, length: int = 5000) -> tuple[list, int]:
    """POST DataTables GetCashTrx; return (aaData rows, recordsTotal)."""
    # Classic DataTables 1.10 serverSide params
    params = {
        "guid": guid,
        "draw": "1",
        "start": "0",
        "length": str(length),
        "search[value]": "",
        "search[regex]": "false",
        "order[0][column]": "0",
        "order[0][dir]": "desc",
        "columns[0][data]": "0",
        "columns[0][name]": "",
        "columns[0][searchable]": "true",
        "columns[0][orderable]": "true",
        "columns[0][search][value]": "",
        "columns[0][search][regex]": "false",
        # also send legacy names some BH endpoints expect
        "sEcho": "1",
        "iDisplayStart": "0",
        "iDisplayLength": str(length),
        "sSearch": "",
        "bRegex": "false",
        "iSortCol_0": "0",
        "sSortDir_0": "desc",
        "iSortingCols": "1",
    }
    st, _, raw = req(opener, f"{BASE}/web/services/json.asmx/GetCashTrx", data=params, form=True)
    text = raw.decode("utf-8", "ignore")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # ASMX may wrap in XML
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise SystemExit(f"GetCashTrx non-JSON for {guid}: {text[:200]}")
        data = json.loads(m.group(0))
    rows = data.get("aaData") or data.get("data") or []
    total = int(data.get("iTotalRecords") or data.get("recordsTotal") or len(rows))
    return rows, total


def money_cell(v) -> float | None:
    d = money(v)
    return float(d) if d != 0 else None  # openpyxl: write 0 as 0 later


def fmt_money_str(d: Decimal) -> str:
    # Turkish format for balance_str
    neg = d < 0
    d = abs(d)
    s = f"{d:,.2f}"  # 1,234.56
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"-{s}" if neg else s


def scrape(out_dir: Path, include_oos: bool = False) -> dict:
    card = load_secrets_card()
    user = (os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER") or "").strip()
    password = (os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD") or "").strip()
    if not user or not password:
        raise SystemExit("BIZIMHESAP_USER / BIZIMHESAP_PASSWORD required")

    opener, _ = build_opener()
    login(opener, user, password)

    st, _, raw = req(opener, f"{BASE}/web/ngn/acc/ngnaccounts")
    html = raw.decode("utf-8", "ignore")
    (out_dir / "_debug_accounts.html").write_text(html, encoding="utf-8")
    page_accs = parse_accounts_page(html)
    print(f"  ngnaccounts parsed: {len(page_accs)}", flush=True)

    # Merge with known ACCOUNT_META (FON / Banka TL not on UI)
    targets = []
    for guid, meta in ACCOUNT_META.items():
        if meta.get("oos") and not include_oos:
            continue
        info = dict(meta)
        info["guid"] = guid
        if guid in page_accs:
            info["balance"] = page_accs[guid]["balance"]
            info["balance_str"] = page_accs[guid]["balance_str"]
            info["currency"] = page_accs[guid].get("currency", "TL")
            # Prefer page name if present
            info["page_name"] = page_accs[guid]["name"]
        else:
            info["balance"] = None
            info["balance_str"] = None
            info["currency"] = "TL"
            info["page_name"] = meta["name"]
        targets.append(info)

    per_dir = out_dir / "per_account"
    per_dir.mkdir(parents=True, exist_ok=True)

    manifest_accounts = []
    bank_move_rows = []
    cash_move_rows = []
    account_xlsx_rows = []

    for info in targets:
        guid = info["guid"]
        name = info["name"]
        print(f"  GetCashTrx {name} ({guid[:8]}…)", flush=True)
        rows, total = get_cash_trx(opener, guid)
        # Normalize rows to list-of-lists; decode HTML entities in text cells
        # so per_account JSON never re-injects &#246; etc. on enrich.
        norm = []
        for r in rows:
            if isinstance(r, dict):
                # unexpected
                cells = [r.get(str(i), "") for i in range(11)]
            else:
                cells = list(r)
            decoded = []
            for i, c in enumerate(cells):
                if isinstance(c, str):
                    decoded.append(htmlmod.unescape(c))
                else:
                    decoded.append(c)
            norm.append(decoded)

        # Final balance from first row (desc order) or page
        final_from_moves = None
        date_min = date_max = None
        if norm:
            # row[7] = bakiye of newest
            final_from_moves = float(money(norm[0][7] if len(norm[0]) > 7 else 0))
            dates = [r[0] for r in norm if r and r[0]]
            # dates are DD.MM.YYYY desc
            if dates:
                date_max = dates[0]
                date_min = dates[-1]

        # Ledger final row is authoritative (page parser can mix adjacent cards)
        if final_from_moves is not None:
            live_bal = final_from_moves
        elif info["balance"] is not None:
            live_bal = info["balance"]
        else:
            live_bal = 0.0
        info["balance"] = live_bal
        info["balance_str"] = fmt_money_str(Decimal(str(live_bal)))

        acc_obj = {
            "guid": guid,
            "name": name,
            "currency": info.get("currency", "TL"),
            "balance_str": info.get("balance_str") or fmt_money_str(Decimal(str(live_bal))),
            "account_type": info["account_type"],
        }
        payload = {"account": acc_obj, "rows": norm}
        safe_fname = f"{name}_{guid}.json"
        (per_dir / safe_fname).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        # also write a thin xlsx per account for reference
        wb = Workbook()
        ws = wb.active
        ws.title = "Hareketler"
        ws.append(
            [
                "Tarih",
                "İşlem",
                "Kullanıcı",
                "Hesap",
                "Açıklama",
                "Borç",
                "Alacak",
                "Bakiye",
                "GUID",
                "Tip",
                "İşlem2",
            ]
        )
        for r in norm:
            ws.append([(r[i] if i < len(r) else "") for i in range(11)])
        wb.save(per_dir / f"{name}_{guid}.xlsx")

        manifest_accounts.append(
            {
                **acc_obj,
                "balance": live_bal,
                "final_from_moves": final_from_moves if final_from_moves is not None else live_bal,
                "move_count": len(norm),
                "records_total": total,
                "date_min": date_min,
                "date_max": date_max,
            }
        )

        # Build import xlsx rows
        if info["account_type"] != "Kasa":
            account_xlsx_rows.append(
                (
                    info["account_type"],
                    info.get("institution"),
                    info["xlsx_name"],
                    None,
                    0,
                    f"BH GUID={guid} | live_bal={live_bal:.2f}",
                    f"BH-ACC-{guid}",
                )
            )

        for r in norm:
            tarih = r[0] if len(r) > 0 else ""
            islem = htmlmod.unescape(str(r[10] if len(r) > 10 and r[10] else (r[1] if len(r) > 1 else "")))
            kullanici = htmlmod.unescape(str(r[2] if len(r) > 2 else "") or "")
            cari = htmlmod.unescape(str(r[3] if len(r) > 3 else "") or "")
            acik = htmlmod.unescape(str(r[4] if len(r) > 4 else "") or "")
            giris = money(r[5] if len(r) > 5 else 0)
            cikis = money(r[6] if len(r) > 6 else 0)
            trx = str(r[8] if len(r) > 8 else "").strip()
            aid = f"BH-TRX-{trx}" if trx else None
            # Combine cari into description like prior scrape
            acik_full = acik
            if cari and cari not in acik:
                acik_full = f"{cari} | {acik}" if acik else cari

            if info["account_type"] == "Kasa":
                cash_move_rows.append(
                    (
                        tarih,
                        islem,
                        acik_full,
                        float(giris),
                        float(cikis),
                        None,
                        cari or None,
                        None,
                        aid,
                        "Hayır",
                        "BizimHesap GetCashTrx",
                    )
                )
            else:
                inst = info.get("institution") or ""
                xname = info["xlsx_name"]
                hesap_disp = f"{inst} - {xname}" if inst else xname
                bank_move_rows.append(
                    (
                        tarih,
                        hesap_disp,
                        islem,
                        acik_full,
                        float(giris),
                        float(cikis),
                        None,
                        cari or None,
                        None,
                        aid,
                        "Hayır",
                        "BizimHesap GetCashTrx",
                    )
                )

        print(
            f"    moves={len(norm)} live={live_bal} final_moves={final_from_moves} range={date_min}..{date_max}",
            flush=True,
        )

    # Write aggregate xlsx
    wb = Workbook()
    ws = wb.active
    ws.title = "Hesaplar"
    ws.append(["Hesap Türü", "Banka Adı", "Hesap Adı", "IBAN", "Açılış Bakiyesi", "Not", "Aktarım ID"])
    for row in account_xlsx_rows:
        ws.append(list(row))
    wb.save(out_dir / "banka_hesaplari.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Hareketler"
    ws.append(
        [
            "Tarih",
            "Hesap",
            "İşlem",
            "Açıklama",
            "Giriş",
            "Çıkış",
            "Sipariş No",
            "Müşteri",
            "Ödeme Türü",
            "Aktarım ID",
            "Tarihsel Kayıt",
            "Kaynak",
        ]
    )
    for row in bank_move_rows:
        ws.append(list(row))
    wb.save(out_dir / "banka_hareketleri.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Hareketler"
    ws.append(
        [
            "Tarih",
            "İşlem",
            "Açıklama",
            "Giriş",
            "Çıkış",
            "Sipariş No",
            "Müşteri",
            "Ödeme Türü",
            "Aktarım ID",
            "Tarihsel Kayıt",
            "Kaynak",
        ]
    )
    for row in cash_move_rows:
        ws.append(list(row))
    wb.save(out_dir / "kasa_hareketleri.xlsx")

    manifest = {
        "source": "BizimHesap web GetCashTrx (full history per account)",
        "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "endpoint": "/web/services/json.asmx/GetCashTrx",
        "accounts_page": "/web/ngn/acc/ngnaccounts",
        "accounts": manifest_accounts,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  Wrote {out_dir} ({len(manifest_accounts)} accounts)", flush=True)
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default="/workspace/baykus-web/tmp/bizimhesap/hesaplarim",
    )
    ap.add_argument("--include-oos", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    scrape(out, include_oos=args.include_oos)


if __name__ == "__main__":
    main()
