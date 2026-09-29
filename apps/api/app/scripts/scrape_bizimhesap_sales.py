#!/usr/bin/env python3
"""Live scrape BizimHesap GetSalesReport → tmp/bizimhesap/sales/ (gitignore).

POST /api/report/getsalesreport with full date range (chunked by month to avoid timeout).
Also saves retail-only and document-list HTML shells when reachable.

Credentials: BIZIMHESAP_USER / BIZIMHESAP_PASSWORD or box-secrets card.*
Never prints secrets.
"""
from __future__ import annotations

import argparse
import calendar
import html as htmlmod
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode

BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
BASE = "https://uygulama.bizimhesap.com"


def load_secrets_card() -> dict:
    if not BOX_SECRETS.is_file():
        return {}
    data = json.loads(BOX_SECRETS.read_text(encoding="utf-8"))
    card = data.get("card") if isinstance(data, dict) else {}
    return card if isinstance(card, dict) else {}


def build_opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj


def req(opener, url: str, data: dict | None = None, json_body=None):
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
        with opener.open(r, timeout=120) as resp:
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
    print(f"  Logged in -> {final}", flush=True)


def month_ranges(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        last = calendar.monthrange(y, m)[1]
        a = date(y, m, 1)
        b = date(y, m, last)
        if a < start:
            a = start
        if b > end:
            b = end
        yield a, b
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1


def tr_date(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def fetch_sales(opener, from_d: date, to_d: date, retail_only: bool = False) -> dict:
    param = {
        "product": "",
        "identity": "",
        "calendarType": "1",
        "officialStatus": "0",
        "projects": "",
        "markets": "",
        "fromDate": tr_date(from_d),
        "toDate": tr_date(to_d),
        "docNo": "",
        "flRetailOnly": "true" if retail_only else "false",
        # default page: Faturalar selected; empty → NullRef on server
        "docStatuses": "3",
        "docTypes": "2, 3",
        "agents": "",
        "categories": "",
        "brands": "",
        "codes1": "",
        "codes2": "",
        "whse": "",
        # first 10 default selected columns on ngnsalesreport
        "columns": "1,2,3,4,5,6,7,8,9,10",
        "outputType": "1",
    }
    # Try form first, then JSON
    for mode in ("form", "json"):
        if mode == "form":
            st, _, raw = req(opener, f"{BASE}/api/report/getsalesreport", data=param)
        else:
            st, _, raw = req(opener, f"{BASE}/api/report/getsalesreport", json_body=param)
        text = raw.decode("utf-8", "ignore")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            print(f"  [{from_d}..{to_d}] mode={mode} status={st} non-json len={len(text)}", flush=True)
            continue
        data = payload.get("data") if isinstance(payload, dict) else None
        if data is None and isinstance(payload, list):
            data = payload
        n = len(data) if isinstance(data, list) else -1
        print(f"  [{from_d}..{to_d}] mode={mode} status={st} rows={n}", flush=True)
        if n >= 0:
            return {"mode": mode, "status": st, "payload": payload, "rows": data if isinstance(data, list) else []}
    return {"mode": None, "status": st, "payload": text[:2000], "rows": []}


def money_sum(rows: list) -> float:
    total = 0.0
    for r in rows:
        if not isinstance(r, dict):
            continue
        for key in ("GrandTotal", "grandTotal", "NetTotal", "netTotal", "Amount", "amount", "Total", "total"):
            if key in r and r[key] not in (None, ""):
                s = str(r[key]).replace("TL", "").strip().replace(".", "").replace(",", ".")
                try:
                    total += float(s)
                except ValueError:
                    pass
                break
    return round(total, 2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("../../tmp/bizimhesap/sales"))
    ap.add_argument("--from", dest="date_from", default="01.01.2025")
    ap.add_argument("--to", dest="date_to", default=None)
    args = ap.parse_args()

    card = load_secrets_card()
    user = os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER")
    password = os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD")
    if not user or not password:
        raise SystemExit("Missing BIZIMHESAP_USER / BIZIMHESAP_PASSWORD")

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    per_month = out / "per_month"
    per_month.mkdir(exist_ok=True)

    def parse_tr(s: str) -> date:
        return datetime.strptime(s, "%d.%m.%Y").date()

    start = parse_tr(args.date_from)
    end = parse_tr(args.date_to) if args.date_to else date.today()

    opener, _ = build_opener()
    login(opener, user, password)

    # Save report page shell
    st, _, raw = req(opener, f"{BASE}/web/ngn/rep/ngnsalesreport")
    (out / "ngnsalesreport.html").write_bytes(raw)
    print(f"  saved ngnsalesreport.html status={st} bytes={len(raw)}", flush=True)

    all_rows: list = []
    month_summaries = []
    for a, b in month_ranges(start, end):
        result = fetch_sales(opener, a, b, retail_only=False)
        rows = result.get("rows") or []
        key = f"{a.year:04d}-{a.month:02d}"
        (per_month / f"sales_{key}.json").write_text(
            json.dumps(result.get("payload"), ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        all_rows.extend(rows)
        month_summaries.append(
            {
                "month": key,
                "from": a.isoformat(),
                "to": b.isoformat(),
                "row_count": len(rows),
                "approx_sum": money_sum(rows),
                "mode": result.get("mode"),
            }
        )
        # retail-only companion for Sep diagnostics
        if a.year == 2026 and a.month == 9:
            r2 = fetch_sales(opener, a, b, retail_only=True)
            (per_month / f"sales_{key}_retail_only.json").write_text(
                json.dumps(r2.get("payload"), ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )

    # Deduplicate by json dump of row if possible
    (out / "sales_all.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    manifest = {
        "source": "BizimHesap GET/POST /api/report/getsalesreport",
        "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "total_rows": len(all_rows),
        "approx_sum_all": money_sum(all_rows),
        "months": month_summaries,
        "sample_keys": sorted(all_rows[0].keys()) if all_rows and isinstance(all_rows[0], dict) else [],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("total_rows", "approx_sum_all", "from", "to")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
