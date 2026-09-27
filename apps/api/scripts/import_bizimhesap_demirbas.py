#!/usr/bin/env python3
"""BizimHesap Demirbaşlar → Baykuş assets + remove machines from sellable stock.

Source (B2B API has NO demirbaş endpoint):
  Panel: Nakit Yönetimi > Demirbaşlar
    GET /web/ngn/org/ngnassets
    GET /web/ngn/org/ngnasset?rc=1&guid={GUID}

Cached export (gitignore):
  tmp/bizimhesap/demirbas/assets.json
  tmp/bizimhesap/demirbas/demirbaslar.xlsx
  tmp/bizimhesap/demirbas/manifest.json

Usage (from apps/api, venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/import_bizimhesap_demirbas.py
  python scripts/import_bizimhesap_demirbas.py --from-cache ../../tmp/bizimhesap/demirbas
  python scripts/import_bizimhesap_demirbas.py --live   # scrape panel (needs BIZIMHESAP_USER/PASSWORD)
  python -m app.scripts.import_bizimhesap_demirbas
  python scripts/import_bizimhesap_demirbas.py --dry-run

Wipe / upsert policy (docs/BIZIMHESAP_IMPORT.md § demirbaş):
  - BACKUP baykus.db
  - Delete ALL existing assets (seed demo + prior BH_IMPORT) unless --keep-existing-assets
  - Upsert BH demirbaş into assets (note=BH_IMPORT:BH-ASSET:{guid})
  - Find products that are demirbaş (heuristics + known BH inventory IDs)
  - Move unmatched machines into assets as BH_FROM_STOCK:{sku}; delete those products
    (null order/quote/purchase/price_list FKs; delete warehouse_stocks/variants/movements)
"""

from __future__ import annotations

from app.utils.html_text import decode_html_entities

import argparse
import json
import os
import re
import shutil
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
import http.cookiejar
import urllib.error
import urllib.request

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
BH_NOTE_PREFIX = "BH_IMPORT:BH-ASSET:"
STOCK_NOTE_PREFIX = "BH_FROM_STOCK:"
DEFAULT_CACHE = Path("../../tmp/bizimhesap/demirbas")
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
    dest = bak_dir / f"baykus_pre_bh_demirbas_{stamp}.db"
    shutil.copy2(db_path, dest)
    return dest


def load_from_cache(cache_dir: Path) -> list[dict[str, Any]]:
    path = cache_dir / "assets.json"
    if not path.is_file():
        raise SystemExit(f"Missing {path} — run with --live or place scrape export there")
    data = json.loads(path.read_text(encoding="utf-8"))
    assets = data.get("assets") if isinstance(data, dict) else data
    if not isinstance(assets, list):
        raise SystemExit(f"Unexpected assets.json shape in {path}")
    return assets


def scrape_live(cache_dir: Path | None) -> list[dict[str, Any]]:
    """Login to panel and scrape Demirbaşlar list + detail pages."""
    card = load_secrets_card()
    user = (os.environ.get("BIZIMHESAP_USER") or card.get("BIZIMHESAP_USER") or "").strip()
    password = (os.environ.get("BIZIMHESAP_PASSWORD") or card.get("BIZIMHESAP_PASSWORD") or "").strip()
    if not user or not password:
        raise SystemExit("BIZIMHESAP_USER / BIZIMHESAP_PASSWORD required for --live")

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    def req(url: str, data: dict | None = None, form: bool = False) -> tuple[int, str, bytes]:
        h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "tr-TR,tr;q=0.9"}
        body = None
        if data is not None:
            if form:
                body = urlencode(data).encode()
                h["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            else:
                body = json.dumps(data).encode()
                h["Content-Type"] = "application/json; charset=utf-8"
        r = urllib.request.Request(url, data=body, headers=h)
        try:
            with opener.open(r, timeout=60) as resp:
                return resp.status, resp.geturl(), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, getattr(e, "url", url), e.read()

    def grab(name: str, src: str) -> str:
        m = re.search(rf'name="{name}"[^>]*value="([^"]*)"', src) or re.search(
            rf'id="{name}"[^>]*value="([^"]*)"', src
        )
        return m.group(1) if m else ""

    st, _, raw = req("https://uygulama.bizimhesap.com/bhlogin")
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
    st, final, raw = req(
        "https://uygulama.bizimhesap.com/bhlogin",
        data=payload,
        form=True,
    )
    if "newportal" not in final and "ngn" not in final:
        raise SystemExit(f"BH login failed (landed on {final})")
    safe_print(f"  Logged in -> {final}")

    st, _, raw = req("https://uygulama.bizimhesap.com/web/ngn/org/ngnassets")
    html = raw.decode("utf-8", "ignore")
    listed = []
    for m in re.finditer(
        r'href="/web/ngn/org/ngnasset\?rc=1&guid=([A-F0-9\-]+)"[^>]*>([^<]+)</a>', html
    ):
        listed.append({"guid": m.group(1), "name": m.group(2).strip()})
    safe_print(f"  List: {len(listed)} demirbaş")

    assets: list[dict[str, Any]] = []
    for item in listed:
        st, _, raw = req(
            f"https://uygulama.bizimhesap.com/web/ngn/org/ngnasset?rc=1&guid={item['guid']}"
        )
        detail = raw.decode("utf-8", "ignore")
        fields: dict[str, str] = {}
        for inp in re.findall(r"<input[^>]+>", detail, re.I):
            nm = re.search(r'\bname="([^"]+)"', inp)
            if not nm or nm.group(1).startswith("__"):
                continue
            typ_m = re.search(r'\btype="([^"]+)"', inp)
            typ = (typ_m.group(1) if typ_m else "text").lower()
            if typ in ("submit", "button", "file", "checkbox"):
                continue
            val_m = re.search(r'\bvalue="([^"]*)"', inp)
            fields[nm.group(1)] = val_m.group(1) if val_m else ""
        name = (fields.get("m$cp$txtAssetName") or item["name"]).strip()
        cost = money(fields.get("m$cp$txtPrice"))
        pd = parse_date(fields.get("m$cp$txtPurchaseDate"))
        serial = (fields.get("m$cp$txtSerial") or "").strip() or None
        cat = "Makine"
        up = name.upper()
        if "HESAP" in up and "MUHASEBE" in up:
            cat = "Yazılım"
        elif not re.search(r"makine|makina|yazic|pres|unite|ünite", name, re.I):
            cat = "Demirbaş"
        assets.append(
            {
                "guid": item["guid"],
                "name": name,
                "category": cat,
                "serial_no": serial,
                "purchase_date": pd.isoformat() if pd else None,
                "cost": float(cost),
                "current_value": float(cost),
                "status": "Aktif",
                "note": f"{BH_NOTE_PREFIX}{item['guid']}",
            }
        )

    if cache_dir:
        cache_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "source": "BizimHesap panel Nakit Yönetimi > Demirbaşlar (/web/ngn/org/ngnassets)",
            "scraped_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "endpoint_list": "/web/ngn/org/ngnassets",
            "endpoint_detail": "/web/ngn/org/ngnasset?rc=1&guid={GUID}",
            "b2b_api": False,
            "count": len(assets),
            "assets": assets,
        }
        (cache_dir / "assets.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (cache_dir / "manifest.json").write_text(
            json.dumps(
                {k: manifest[k] for k in ("source", "scraped_at", "endpoint_list", "endpoint_detail", "b2b_api", "count")},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        safe_print(f"  Cached under {cache_dir}")
    return assets


def delete_product_tree(db, product_id: int) -> dict[str, int]:
    from sqlalchemy import text

    counts: dict[str, int] = {}
    for table, cols in (
        ("order_lines", ("product_id", "variant_id")),
        ("quote_lines", ("product_id", "variant_id")),
        ("purchase_lines", ("product_id", "variant_id")),
        ("price_list_items", ("product_id", "variant_id")),
    ):
        try:
            for col in cols:
                if col == "product_id":
                    res = db.execute(
                        text(f"UPDATE {table} SET {col} = NULL WHERE {col} = :pid"),
                        {"pid": product_id},
                    )
                else:
                    # null variants belonging to this product
                    res = db.execute(
                        text(
                            f"UPDATE {table} SET {col} = NULL WHERE {col} IN "
                            f"(SELECT id FROM product_variants WHERE product_id = :pid)"
                        ),
                        {"pid": product_id},
                    )
                counts[f"null_{table}_{col}"] = res.rowcount or 0
        except Exception as exc:  # noqa: BLE001
            counts[f"null_{table}_err"] = str(exc)  # type: ignore[assignment]

    for table in ("warehouse_stocks", "stock_movements", "product_variants"):
        res = db.execute(
            text(f"DELETE FROM {table} WHERE product_id = :pid"), {"pid": product_id}
        )
        counts[f"delete_{table}"] = res.rowcount or 0
    res = db.execute(text("DELETE FROM products WHERE id = :pid"), {"pid": product_id})
    counts["delete_products"] = res.rowcount or 0
    return counts


def run_import(
    assets_src: list[dict[str, Any]],
    *,
    dry_run: bool,
    keep_existing_assets: bool,
) -> dict[str, Any]:
    from sqlalchemy.orm import sessionmaker

    from app.db.session import engine
    from app.integrations.demirbas_classify import is_demirbas_title, names_match
    from app.models.asset import Asset
    from app.models.product import Product

    Session = sessionmaker(bind=engine)
    db = Session()
    stats: dict[str, Any] = {
        "bh_assets": len(assets_src),
        "assets_deleted": 0,
        "assets_created": 0,
        "products_moved": [],
        "products_deleted": 0,
        "extra_assets_from_stock": 0,
    }
    try:
        if not keep_existing_assets:
            n = db.query(Asset).count()
            if not dry_run:
                db.query(Asset).delete()
                db.commit()
            stats["assets_deleted"] = n
            safe_print(f"  Wiped {n} existing assets (demo + prior)")
        else:
            # idempotent: remove prior BH_IMPORT / BH_FROM_STOCK only
            rows = db.query(Asset).all()
            n = 0
            for a in rows:
                note = a.note or ""
                if note.startswith(BH_NOTE_PREFIX) or note.startswith(STOCK_NOTE_PREFIX):
                    n += 1
                    if not dry_run:
                        db.delete(a)
            if not dry_run:
                db.commit()
            stats["assets_deleted"] = n
            safe_print(f"  Removed {n} prior BH/stock-tagged assets")

        # Insert BH assets
        for src in assets_src:
            name = decode_html_entities(src.get("name")).strip()
            if not name:
                continue
            guid = (src.get("guid") or "").strip()
            note = decode_html_entities(src.get("note")).strip() or (f"{BH_NOTE_PREFIX}{guid}" if guid else None)
            row = Asset(
                name=name[:200],
                category=(src.get("category") or "Demirbaş")[:100],
                serial_no=(src.get("serial_no") or None),
                purchase_date=parse_date(src.get("purchase_date")),
                cost=money(src.get("cost")),
                current_value=money(src.get("current_value") if src.get("current_value") is not None else src.get("cost")),
                status=(src.get("status") or "Aktif")[:40],
                depreciation_method="none",
                useful_life_months=None,
                note=note,
                active=True,
            )
            if not dry_run:
                db.add(row)
            stats["assets_created"] += 1
            safe_print(f"  + asset: {name} cost={row.cost}")
        if not dry_run:
            db.commit()

        # Products that should not be sellable stock
        products = db.query(Product).all()
        bh_names = [(src.get("name") or "") for src in assets_src]
        to_remove: list[Product] = []
        for p in products:
            bh_id = None
            if p.sku and p.sku.startswith("BH:"):
                bh_id = p.sku[3:]
            # description may have BH_ID=
            if not bh_id and p.description:
                m = re.search(r"BH_ID=([A-F0-9]+)", p.description or "", re.I)
                if m:
                    bh_id = m.group(1)
            # Only machine/heuristic titles — do NOT use names_match here
            # (e.g. service "TRANSFER BASKI" must not match "… TRANSFER BASKI PRESİ")
            if is_demirbas_title(p.name, bh_id):
                to_remove.append(p)

        for p in to_remove:
            # If no BH asset already covers this name, create from stock
            covered = any(names_match(p.name, bn) for bn in bh_names)
            if not covered:
                extra = Asset(
                    name=p.name[:200],
                    category="Makine",
                    serial_no=None,
                    purchase_date=None,
                    cost=money(p.purchase_price or p.cost or 0),
                    current_value=money(p.purchase_price or p.cost or 0),
                    status="Aktif",
                    depreciation_method="none",
                    note=f"{STOCK_NOTE_PREFIX}{p.sku} | moved_from_products",
                    active=True,
                )
                if not dry_run:
                    db.add(extra)
                stats["extra_assets_from_stock"] += 1
                safe_print(f"  + asset from stock: {p.name} (sku={p.sku})")
            stats["products_moved"].append(
                {"id": p.id, "sku": p.sku, "name": p.name, "stock_qty": p.stock_qty}
            )
            if not dry_run:
                delete_product_tree(db, p.id)
            stats["products_deleted"] += 1
            safe_print(f"  - product removed from stock: {p.name} (sku={p.sku})")

        if not dry_run:
            db.commit()
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
    ap = argparse.ArgumentParser(description="Import BizimHesap demirbaş into Baykuş")
    ap.add_argument("--from-cache", type=str, default=None, help="Cache dir with assets.json")
    ap.add_argument("--live", action="store_true", help="Scrape BH panel then import")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-backup", action="store_true")
    ap.add_argument(
        "--keep-existing-assets",
        action="store_true",
        help="Do not wipe all assets; only replace BH_IMPORT / BH_FROM_STOCK rows",
    )
    args = ap.parse_args()

    cache_dir = Path(args.from_cache) if args.from_cache else DEFAULT_CACHE
    if not cache_dir.is_absolute():
        cache_dir = (API_ROOT / cache_dir).resolve()

    safe_print("=== BizimHesap Demirbaş → Baykuş ===")
    db_path = resolve_sqlite_path()
    safe_print(f"DB: {db_path}")
    if not args.skip_backup and not args.dry_run:
        bak = backup_db(db_path)
        if bak:
            safe_print(f"Backup: {bak}")

    if args.live:
        assets = scrape_live(cache_dir)
    else:
        assets = load_from_cache(cache_dir)
    safe_print(f"Source assets: {len(assets)}")

    stats = run_import(
        assets,
        dry_run=args.dry_run,
        keep_existing_assets=args.keep_existing_assets,
    )
    safe_print("--- summary ---")
    safe_print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    if args.dry_run:
        safe_print("(dry-run: no DB writes)")


if __name__ == "__main__":
    main()
