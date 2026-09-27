#!/usr/bin/env python3
"""One-shot BizimHesap -> Baykuş import: products, variants, warehouses, stock.

Usage (from apps/api, with venv + SQLite):
  export DATABASE_URL=sqlite:///./baykus.db
  export BIZIMHESAP_TOKEN=...   # or load from box-secrets / --token-file
  python scripts/import_bizimhesap_stock.py

  # Offline / replay cached probes:
  python scripts/import_bizimhesap_stock.py --from-cache ../../tmp/bizimhesap

Wipe policy (see docs/BIZIMHESAP_IMPORT.md):
  - BACKUP baykus.db first
  - DELETE warehouse_stocks, stock_movements, product_variants, products, warehouses
  - NULL product/variant FKs on order_lines, quote_lines, purchase_lines, price_list_items
  - KEEP users, roles, settings, customers, suppliers, finance, etc.
"""

from __future__ import annotations

import argparse
import hashlib
import time
import json
import os
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.utils.html_text import decode_html_entities

# Allow `python scripts/import_bizimhesap_stock.py` from apps/api
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

DEFAULT_PUBLIC_KEY = "BZMHB2B724018943908D0B82491F203F"
BOX_SECRETS = Path("/home/box/agent-data/box-secrets.json")
SKU_MAX = 64


def load_token(token_file: str | None) -> str:
    env = (os.environ.get("BIZIMHESAP_TOKEN") or "").strip()
    if env:
        return env
    if token_file:
        p = Path(token_file)
        text = p.read_text(encoding="utf-8").strip()
        if p.suffix.lower() == ".json":
            data = json.loads(text)
            if isinstance(data, dict):
                card = data.get("card") if isinstance(data.get("card"), dict) else data
                for key in ("BIZIMHESAP_TOKEN", "token", "Token"):
                    if card.get(key):
                        return str(card[key]).strip()
            raise SystemExit(f"No token key in JSON: {p}")
        return text
    if BOX_SECRETS.is_file():
        data = json.loads(BOX_SECRETS.read_text(encoding="utf-8"))
        card = data.get("card") if isinstance(data, dict) else {}
        tok = (card or {}).get("BIZIMHESAP_TOKEN")
        if tok:
            return str(tok).strip()
    raise SystemExit(
        "BIZIMHESAP_TOKEN not found. Set env, pass --token-file, or place it in "
        f"{BOX_SECRETS} under card.BIZIMHESAP_TOKEN"
    )


def norm_text(s: str | None) -> str:
    t = (s or "").strip()
    # Turkish İ/I folding for matching
    t = t.replace("İ", "I").replace("ı", "i").replace("Ş", "S").replace("ş", "s")
    t = t.replace("Ğ", "G").replace("ğ", "g").replace("Ü", "U").replace("ü", "u")
    t = t.replace("Ö", "O").replace("ö", "o").replace("Ç", "C").replace("ç", "c")
    return re.sub(r"\s+", " ", t).upper()


def money(val: Any) -> Decimal:
    try:
        return Decimal(str(val if val is not None else 0)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0.00")


def as_int_qty(val: Any) -> int:
    try:
        return int(round(float(val)))
    except (TypeError, ValueError):
        return 0


def sku_product(bh_id: str) -> str:
    return f"BH:{bh_id}"[:SKU_MAX]


def sku_variant(bh_id: str, variant: str) -> str:
    digest = hashlib.sha1(f"{bh_id}|{variant}".encode("utf-8")).hexdigest()[:10]
    base = f"BHV:{bh_id[:12]}:{digest}"
    return base[:SKU_MAX]


def parse_size_color(variant: str, variant_name: str) -> tuple[str | None, str | None]:
    v = (variant or "").strip()
    vn = (variant_name or "").strip().upper()
    if not v:
        return None, None
    if " -- " in v:
        parts = [p.strip() for p in v.split(" -- ", 1)]
    elif "-" in v and ("BEDEN" in vn or "RENK" in vn):
        idx = v.rfind("-")
        parts = [v[:idx].strip(), v[idx + 1 :].strip()] if idx > 0 else [v]
    else:
        parts = [v]

    size = color = None
    if "BEDEN" in vn and "RENK" in vn and len(parts) >= 2:
        size, color = parts[0], parts[1]
    elif vn == "RENK" or vn.endswith("RENK") and "BEDEN" not in vn:
        color = v
    elif vn in ("BEDEN", "EBAT") or vn.startswith("BEDEN") or vn.startswith("EBAT"):
        size = v if len(parts) == 1 else parts[0]
        if len(parts) >= 2:
            color = parts[1]
    else:
        if len(parts) >= 2:
            size, color = parts[0], parts[1]
        else:
            size = v
    return size or None, color or None


def match_inventory_row(
    item: dict[str, Any], rows: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Map an inventory line onto a BH product-row (often a variant)."""
    if not rows:
        return None
    if len(rows) == 1 and not (rows[0].get("variant") or "").strip():
        return rows[0]

    ititle = norm_text(item.get("title"))
    cands: list[dict[str, Any]] = []
    for r in rows:
        var = (r.get("variant") or "").strip()
        combined = norm_text(f"{r.get('title') or ''} {var}")
        combined2 = norm_text(f"{r.get('title') or ''}{var}")
        nvar = norm_text(var)
        if ititle == combined or ititle == combined2:
            cands.append(r)
        elif nvar and (ititle.endswith(nvar) or nvar in ititle):
            cands.append(r)

    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        exact = [
            r
            for r in cands
            if norm_text(f"{r.get('title') or ''} {r.get('variant') or ''}") == ititle
            or norm_text(f"{r.get('title') or ''}{r.get('variant') or ''}") == ititle
        ]
        if len(exact) == 1:
            return exact[0]
        # Prefer longest variant match
        cands.sort(key=lambda r: len(norm_text(r.get("variant") or "")), reverse=True)
        return cands[0]
    # Fallback: if only one row share this id, use it
    if len(rows) == 1:
        return rows[0]
    return None


def backup_db(db_path: Path, backups_dir: Path) -> Path | None:
    if not db_path.is_file():
        print(f"  (no DB file yet at {db_path})")
        return None
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = backups_dir / f"baykus_pre_bh_import_{stamp}.db"
    shutil.copy2(db_path, dest)
    print(f"  Backup -> {dest} ({dest.stat().st_size} bytes)")
    return dest


def resolve_db_path() -> Path:
    from app.core.config import get_settings

    url = get_settings().database_url
    if not url.startswith("sqlite"):
        return Path("baykus.db")  # informational only for non-sqlite
    raw = url.split("sqlite:///", 1)[-1]
    p = Path(raw)
    if not p.is_absolute():
        p = (API_ROOT / p).resolve()
    return p


def wipe_stock_catalog(db) -> dict[str, int]:
    """Reset products/variants/warehouses/stocks; keep users & settings."""
    from sqlalchemy import text

    counts: dict[str, int] = {}

    # Null FKs that SET NULL (demo leftovers that would collide / orphan)
    for table, cols in (
        ("order_lines", ("product_id", "variant_id")),
        ("quote_lines", ("product_id", "variant_id")),
        ("purchase_lines", ("product_id", "variant_id")),
        ("price_list_items", ("product_id", "variant_id")),
    ):
        try:
            for col in cols:
                res = db.execute(text(f"UPDATE {table} SET {col} = NULL WHERE {col} IS NOT NULL"))
                counts[f"null_{table}_{col}"] = res.rowcount or 0
        except Exception as exc:  # noqa: BLE001 - table may not exist on fresh DB
            counts[f"null_{table}_err"] = str(exc)  # type: ignore[assignment]

    for table in (
        "warehouse_stocks",
        "stock_movements",
        "product_variants",
        "products",
        "warehouses",
    ):
        res = db.execute(text(f"DELETE FROM {table}"))
        counts[f"delete_{table}"] = res.rowcount or 0

    db.commit()
    return counts


def load_from_cache(cache_dir: Path) -> tuple[list, list, dict[str, list]]:
    products = json.loads((cache_dir / "products.json").read_text(encoding="utf-8"))
    warehouses = json.loads((cache_dir / "warehouses.json").read_text(encoding="utf-8"))
    prods = products["data"]["products"]
    whs = warehouses["data"]["warehouses"]
    inventories: dict[str, list] = {}
    for wh in whs:
        wid = wh["id"]
        path = cache_dir / f"inventory_{wid}.json"
        if path.is_file():
            inv = json.loads(path.read_text(encoding="utf-8"))
            inventories[wid] = inv["data"]["inventory"]
        else:
            inventories[wid] = []
    return prods, whs, inventories


def fetch_live(token: str, public_key: str, cache_dir: Path | None) -> tuple[list, list, dict[str, list]]:
    from app.integrations.bizimhesap_b2b import BizimHesapB2BClient

    client = BizimHesapB2BClient(token=token, public_key=public_key)
    print("  GET /warehouses ...")
    whs = client.fetch_warehouses()
    print(f"  -> {len(whs)} warehouses")
    print("  GET /products ...")
    prods = client.fetch_products()
    print(f"  -> {len(prods)} product rows")
    inventories: dict[str, list] = {}
    for wh in whs:
        wid = wh["id"]
        time.sleep(0.8)  # Cloudflare rate-limit courtesy
        print(f"  GET /inventory/{wid} ({wh.get('title')}) ...")
        items = client.fetch_inventory(wid)
        inventories[wid] = items
        print(f"  -> {len(items)} inventory lines")

    if cache_dir:
        cache_dir.mkdir(parents=True, exist_ok=True)
        (cache_dir / "warehouses.json").write_text(
            json.dumps({"resultCode": 1, "errorText": "", "data": {"warehouses": whs}}, ensure_ascii=False),
            encoding="utf-8",
        )
        (cache_dir / "products.json").write_text(
            json.dumps({"resultCode": 1, "errorText": "", "data": {"products": prods}}, ensure_ascii=False),
            encoding="utf-8",
        )
        for wid, items in inventories.items():
            (cache_dir / f"inventory_{wid}.json").write_text(
                json.dumps({"resultCode": 1, "errorText": "", "data": {"inventory": items}}, ensure_ascii=False),
                encoding="utf-8",
            )
        print(f"  Cached JSON under {cache_dir} (gitignored)")
    return prods, whs, inventories


def import_all(
    db,
    bh_products: list[dict[str, Any]],
    bh_warehouses: list[dict[str, Any]],
    inventories: dict[str, list],
) -> dict[str, Any]:
    from app.models.product import DEFAULT_WAREHOUSE, Product, ProductVariant, StockMovement
    from app.models.warehouse import Warehouse, WarehouseStock

    stats: dict[str, Any] = {
        "warehouses": 0,
        "products": 0,
        "variants": 0,
        "warehouse_stocks": 0,
        "inventory_matched": 0,
        "inventory_unmatched": 0,
        "inventory_orphans_created": 0,
        "inventory_demirbas_skipped": 0,
        "stock_movements": 0,
    }

    # --- Warehouses ---
    default_name = DEFAULT_WAREHOUSE
    wh_by_bh: dict[str, Warehouse] = {}
    for i, wh in enumerate(bh_warehouses):
        bh_id = str(wh.get("id") or "").strip()
        title = (wh.get("title") or "").strip() or f"Depo {bh_id[:8]}"
        code = f"BH:{bh_id}"[:40]
        is_default = title.casefold() == "ana depo" or (i == 0 and not any(
            (w.get("title") or "").strip().casefold() == "ana depo" for w in bh_warehouses
        ))
        row = Warehouse(
            name=title,
            code=code,
            notes=f"BizimHesap warehouse id={bh_id}",
            is_active=True,
            is_default=is_default,
            address=None,
        )
        db.add(row)
        db.flush()
        wh_by_bh[bh_id] = row
        if is_default:
            default_name = title
        stats["warehouses"] += 1

    # --- Group BH rows by product id ---
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in bh_products:
        bid = str(row.get("id") or "").strip()
        if bid:
            by_id[bid].append(row)

    product_map: dict[str, Product] = {}  # bh_id -> Product
    # variant_map: (bh_id, norm_variant) -> ProductVariant ; also bare product key
    variant_map: dict[tuple[str, str], ProductVariant] = {}
    bare_variant: dict[str, None] = {}  # bh ids with no variants

    for bh_id, rows in by_id.items():
        head = rows[0]
        title = (head.get("title") or "").strip() or f"Ürün {bh_id[:8]}"
        # Prefer non-empty brand/category/description from any row
        brand = next((str(r.get("brand")).strip() for r in rows if (r.get("brand") or "").strip()), None)
        category = next(
            (str(r.get("category")).strip() for r in rows if (r.get("category") or "").strip()), None
        )
        description_bits = []
        desc = next((decode_html_entities(r.get("description")).strip() for r in rows if (r.get("description") or "").strip()), "")
        if desc:
            description_bits.append(desc)
        unit = next((str(r.get("unit")).strip() for r in rows if (r.get("unit") or "").strip()), "")
        tax = head.get("tax")
        meta = f"BH_ID={bh_id}"
        if unit:
            meta += f" | Birim={unit}"
        if tax is not None and str(tax) != "":
            meta += f" | KDV=%{tax}"
        description_bits.append(meta)

        price = money(head.get("price"))
        cost = money(head.get("buyingPrice"))
        is_active = bool(int(head.get("isActive") or 0)) if str(head.get("isActive", "1")) != "" else True
        barcode_head = next((str(r.get("barcode")).strip() for r in rows if (r.get("barcode") or "").strip()), None)

        has_variants = any((r.get("variant") or "").strip() for r in rows)
        # Aggregate qty from BH product.quantity (per-row); warehouse inventory overrides later
        prod = Product(
            sku=sku_product(bh_id),
            name=decode_html_entities(title).strip(),
            category=category,
            brand=brand,
            product_type="stoklu",
            description="\n".join(description_bits),
            base_price=price,
            purchase_price=cost,
            cost=cost,
            is_active=is_active,
            warehouse=default_name,
            stock_qty=0,
            critical_stock_threshold=10,
        )
        db.add(prod)
        db.flush()
        product_map[bh_id] = prod
        stats["products"] += 1

        if has_variants:
            seen_var: set[str] = set()
            for r in rows:
                var = (r.get("variant") or "").strip()
                if not var:
                    continue
                key = norm_text(var)
                if key in seen_var:
                    continue
                seen_var.add(key)
                size, color = parse_size_color(var, str(r.get("variantName") or ""))
                vprice = money(r.get("variantPrice"))
                if vprice == 0:
                    vprice = money(r.get("price"))
                vbarcode = (str(r.get("barcode") or "").strip() or None)
                vv = ProductVariant(
                    product_id=prod.id,
                    name=var[:255],
                    sku=sku_variant(bh_id, var),
                    color=color[:50] if color else None,
                    size=size[:50] if size else None,
                    barcode=vbarcode,
                    price=vprice,
                    stock_qty=0,
                )
                db.add(vv)
                db.flush()
                variant_map[(bh_id, key)] = vv
                stats["variants"] += 1
        else:
            bare_variant[bh_id] = None
            # stash barcode on a synthetic note via description already; product has no barcode col
            _ = barcode_head

    db.flush()

    # --- Apply inventory per warehouse ---
    # In-memory upsert: query() won't see unflushed pending rows -> UNIQUE collisions.
    ws_index: dict[tuple[int, int, str], WarehouseStock] = {}

    def upsert_ws(prod: Product, variant: ProductVariant | None, wname: str, qty: int) -> WarehouseStock:
        vkey = int(variant.id) if variant else 0
        key = (prod.id, vkey, wname)
        ws = ws_index.get(key)
        if ws is None:
            ws = WarehouseStock(
                product_id=prod.id,
                variant_id=variant.id if variant else None,
                variant_key=vkey,
                warehouse=wname,
                quantity=qty,
            )
            db.add(ws)
            ws_index[key] = ws
            stats["warehouse_stocks"] += 1
        else:
            ws.quantity = int(ws.quantity or 0) + qty
        return ws

    for wh in bh_warehouses:
        wid = str(wh["id"])
        wname = wh_by_bh[wid].name
        items = inventories.get(wid) or []
        for item in items:
            bh_id = str(item.get("id") or "").strip()
            qty = as_int_qty(item.get("qty"))
            rows = by_id.get(bh_id) or []
            matched = match_inventory_row(item, rows) if rows else None
            variant: ProductVariant | None = None

            if matched is None and not rows:
                title = (item.get("title") or "").strip() or f"Stok {bh_id[:8]}"
                from app.integrations.demirbas_classify import is_demirbas_title
                if is_demirbas_title(title, bh_id):
                    stats.setdefault("inventory_demirbas_skipped", 0)
                    stats["inventory_demirbas_skipped"] += 1
                    continue
                prod = product_map.get(bh_id)
                if not prod:
                    orphan_sku = sku_product(bh_id or hashlib.sha1(title.encode()).hexdigest()[:32])
                    existing = db.query(Product).filter(Product.sku == orphan_sku).first()
                    if existing:
                        prod = existing
                    else:
                        prod = Product(
                            sku=orphan_sku,
                            name=decode_html_entities(title)[:255],
                            product_type="stoklu",
                            description=f"BH_ID={bh_id} | orphan_from_inventory",
                            base_price=Decimal("0.00"),
                            purchase_price=Decimal("0.00"),
                            cost=Decimal("0.00"),
                            is_active=True,
                            warehouse=default_name,
                            stock_qty=0,
                        )
                        db.add(prod)
                        db.flush()
                        stats["products"] += 1
                        stats["inventory_orphans_created"] += 1
                    product_map[bh_id] = prod
                    bare_variant[bh_id] = None
                stats["inventory_unmatched"] += 1
            elif matched is None:
                stats["inventory_unmatched"] += 1
                continue
            else:
                stats["inventory_matched"] += 1
                prod = product_map[bh_id]
                var = (matched.get("variant") or "").strip()
                if var:
                    variant = variant_map.get((bh_id, norm_text(var)))

            upsert_ws(prod, variant, wname, qty)

            if qty != 0:
                before = int((variant.stock_qty if variant else prod.stock_qty) or 0)
                db.add(
                    StockMovement(
                        product_id=prod.id,
                        variant_id=variant.id if variant else None,
                        direction="increase" if qty >= 0 else "decrease",
                        quantity=abs(qty),
                        qty_before=before,
                        qty_after=before + qty,
                        reason="bizimhesap_import",
                        note=f"BH inventory {wname} id={bh_id}",
                        warehouse=wname,
                    )
                )
                stats["stock_movements"] += 1

    db.flush()

    # --- Recompute product/variant stock_qty from warehouse_stocks ---
    all_ws = db.query(WarehouseStock).all()
    # reset
    for p in product_map.values():
        p.stock_qty = 0
        p.warehouse = default_name
    for vv in variant_map.values():
        vv.stock_qty = 0

    from collections import defaultdict as dd

    prod_totals: dict[int, int] = dd(int)
    var_totals: dict[int, int] = dd(int)
    for row in all_ws:
        q = int(row.quantity or 0)
        prod_totals[row.product_id] += q
        if row.variant_id:
            var_totals[row.variant_id] += q

    for pid, total in prod_totals.items():
        p = db.get(Product, pid)
        if p:
            p.stock_qty = total
    for vid, total in var_totals.items():
        v = db.get(ProductVariant, vid)
        if v:
            v.stock_qty = total

    # Products with no warehouse_stocks but BH quantity - seed Ana Depo from product.quantity
    for bh_id, rows in by_id.items():
        prod = product_map.get(bh_id)
        if not prod:
            continue
        has_ws = any(k[0] == prod.id for k in ws_index)
        if has_ws:
            continue
        if bh_id in bare_variant or not any((r.get("variant") or "").strip() for r in rows):
            q = as_int_qty(rows[0].get("quantity"))
            if q:
                upsert_ws(prod, None, default_name, q)
                prod.stock_qty = int(prod.stock_qty or 0) + q
        else:
            for r in rows:
                var = (r.get("variant") or "").strip()
                if not var:
                    continue
                vv = variant_map.get((bh_id, norm_text(var)))
                if not vv:
                    continue
                q = as_int_qty(r.get("quantity"))
                if not q:
                    continue
                upsert_ws(prod, vv, default_name, q)
                vv.stock_qty = int(vv.stock_qty or 0) + q
                prod.stock_qty = int(prod.stock_qty or 0) + q

    db.commit()
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="BizimHesap -> Baykuş ürün/depo/stok import")
    parser.add_argument("--token-file", help="Token plain text or JSON (card.BIZIMHESAP_TOKEN)")
    parser.add_argument("--public-key", default=DEFAULT_PUBLIC_KEY)
    parser.add_argument(
        "--from-cache",
        metavar="DIR",
        help="Use tmp JSON cache instead of live API (e.g. ../../tmp/bizimhesap)",
    )
    parser.add_argument(
        "--cache-dir",
        default="",
        help="When fetching live, also write JSON cache here (default: ../../tmp/bizimhesap)",
    )
    parser.add_argument("--skip-backup", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Fetch only; do not touch DB")
    args = parser.parse_args(argv)

    # Ensure SQLite default for local box if unset / still pointing at postgres
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url or "postgresql" in db_url:
        os.environ["DATABASE_URL"] = "sqlite:///./baykus.db"
        # clear settings cache if already imported
        try:
            from app.core.config import get_settings

            get_settings.cache_clear()
        except Exception:
            pass

    print("=== BizimHesap -> Baykus stock import ===")
    print(f"  cwd={Path.cwd()}")
    print(f"  DATABASE_URL={os.environ.get('DATABASE_URL')}")

    token = None
    if not args.from_cache:
        token = load_token(args.token_file)
        print("  Token: loaded (not printed)")

    cache_dir = Path(args.from_cache) if args.from_cache else None
    if cache_dir and not cache_dir.is_absolute():
        cache_dir = (API_ROOT / cache_dir).resolve()

    write_cache = Path(args.cache_dir) if args.cache_dir else (API_ROOT.parent.parent / "tmp" / "bizimhesap")
    if args.from_cache:
        print(f"  Loading cache from {cache_dir}")
        assert cache_dir is not None
        bh_products, bh_warehouses, inventories = load_from_cache(cache_dir)
    else:
        assert token is not None
        print("  Fetching live from bizimhesap.com ...")
        bh_products, bh_warehouses, inventories = fetch_live(token, args.public_key, write_cache)

    print(
        f"  Summary fetch: {len(bh_products)} product-rows, "
        f"{len({p.get('id') for p in bh_products})} unique products, "
        f"{len(bh_warehouses)} warehouses, "
        f"{sum(len(v) for v in inventories.values())} inventory lines"
    )

    if args.dry_run:
        print("  Dry-run - DB untouched.")
        return 0

    # Ensure SQLite schema exists without re-seeding demo catalog
    from app.core.config import get_settings
    from app.bootstrap_sqlite import is_sqlite

    if is_sqlite():
        import app.models  # noqa: F401 - register metadata
        from app.db.base import Base
        from app.db.session import engine

        Base.metadata.create_all(bind=engine)
        # Lightweight column patches used by web (same as bootstrap_sqlite)
        from sqlalchemy import inspect, text as sql_text

        insp = inspect(engine)
        with engine.begin() as conn:
            if "warehouses" not in insp.get_table_names():
                pass  # create_all handled it

    db_path = resolve_db_path()
    if not args.skip_backup:
        print("  Backing up SQLite ...")
        backup_db(db_path, API_ROOT / "backups")

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        print("  Wiping demo product/warehouse/stock data ...")
        wipe_counts = wipe_stock_catalog(db)
        for k, v in wipe_counts.items():
            print(f"    {k}: {v}")

        print("  Importing ...")
        stats = import_all(db, bh_products, bh_warehouses, inventories)
        print("  Done:")
        for k, v in stats.items():
            print(f"    {k}: {v}")

        # Smoke counts
        from app.models.product import Product, ProductVariant
        from app.models.warehouse import Warehouse, WarehouseStock

        print("  Smoke:")
        print(f"    products={db.query(Product).count()}")
        print(f"    variants={db.query(ProductVariant).count()}")
        print(f"    warehouses={db.query(Warehouse).count()}")
        print(f"    warehouse_stocks={db.query(WarehouseStock).count()}")
        for w in db.query(Warehouse).order_by(Warehouse.id).all():
            total = (
                db.query(WarehouseStock)
                .filter(WarehouseStock.warehouse == w.name)
                .count()
            )
            qty_sum = sum(
                int(r.quantity or 0)
                for r in db.query(WarehouseStock).filter(WarehouseStock.warehouse == w.name).all()
            )
            print(f"    depo '{w.name}' code={w.code} rows={total} qty_sum={qty_sum}")
        sample = (
            db.query(WarehouseStock)
            .filter(WarehouseStock.quantity > 0)
            .order_by(WarehouseStock.quantity.desc())
            .limit(5)
            .all()
        )
        for s in sample:
            p = db.get(Product, s.product_id)
            print(f"    sample stock: {p.name if p else '?'} @ {s.warehouse} qty={s.quantity}")
    finally:
        db.close()

    print("=== import complete ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
