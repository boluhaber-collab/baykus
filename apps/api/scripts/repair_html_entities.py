#!/usr/bin/env python3
"""One-shot repair: decode HTML entities (&#246; etc.) in stored text fields.

Targets cash_movements / bank_movements notes (primary), plus cari/supplier/
product/account name+note columns if any still contain ``&#``.

Usage (from apps/api):
  export DATABASE_URL=sqlite:///./baykus.db
  python scripts/repair_html_entities.py
  python scripts/repair_html_entities.py --dry-run
  python -m app.scripts.repair_html_entities
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.chdir(API_ROOT)

from app.utils.html_text import decode_html_entities  # noqa: E402

# (table, column) pairs to scan. Keep broad so future BH imports are covered.
TEXT_TARGETS: list[tuple[str, str]] = [
    ("cash_movements", "note"),
    ("bank_movements", "note"),
    ("cari_movements", "note"),
    ("supplier_movements", "note"),
    ("stock_movements", "note"),
    ("expenses", "note"),
    ("expenses", "description"),
    ("bank_accounts", "name"),
    ("bank_accounts", "notes"),
    ("bank_accounts", "institution"),
    ("cash_registers", "name"),
    ("cash_registers", "notes"),
    ("customers", "name"),
    ("customers", "notes"),
    ("customers", "company"),
    ("suppliers", "name"),
    ("suppliers", "notes"),
    ("suppliers", "company"),
    ("products", "name"),
    ("products", "description"),
    ("product_variants", "name"),
    ("assets", "name"),
    ("assets", "notes"),
    ("directory_contacts", "name"),
    ("directory_contacts", "notes"),
]


def _table_columns(conn, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    # sqlite3 Row or tuple: cid, name, type, ...
    return {r[1] for r in rows}


def repair(conn, *, dry_run: bool) -> dict[str, Any]:
    stats: dict[str, Any] = {"tables": {}, "total_fixed": 0, "dry_run": dry_run}
    existing = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    for table, col in TEXT_TARGETS:
        if table not in existing:
            continue
        cols = _table_columns(conn, table)
        if col not in cols:
            continue
        # Only rows that still look entity-encoded
        rows = conn.execute(
            f"SELECT id, {col} FROM {table} WHERE {col} LIKE ?",
            ("%&#%",),
        ).fetchall()
        fixed = 0
        for row_id, raw in rows:
            if raw is None:
                continue
            decoded = decode_html_entities(raw)
            if decoded == raw:
                continue
            fixed += 1
            if not dry_run:
                conn.execute(
                    f"UPDATE {table} SET {col} = ? WHERE id = ?",
                    (decoded, row_id),
                )
        if fixed:
            stats["tables"][f"{table}.{col}"] = fixed
            stats["total_fixed"] += fixed
    if not dry_run and stats["total_fixed"]:
        conn.commit()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Decode HTML entities in Baykuş text columns")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--db",
        default=None,
        help="Path to SQLite DB (default: apps/api/baykus.db via DATABASE_URL or ./baykus.db)",
    )
    args = parser.parse_args()

    import sqlite3

    db_path = args.db
    if not db_path:
        url = os.environ.get("DATABASE_URL", "sqlite:///./baykus.db")
        if url.startswith("sqlite:///"):
            db_path = url[len("sqlite:///") :]
            if db_path.startswith("./"):
                db_path = str(API_ROOT / db_path[2:])
        else:
            db_path = str(API_ROOT / "baykus.db")

    path = Path(db_path)
    if not path.is_file():
        raise SystemExit(f"DB not found: {path}")

    conn = sqlite3.connect(str(path))
    try:
        stats = repair(conn, dry_run=args.dry_run)
    finally:
        conn.close()

    print(f"db={path}")
    print(f"dry_run={stats['dry_run']}")
    print(f"total_fixed={stats['total_fixed']}")
    for k, v in sorted(stats["tables"].items()):
        print(f"  {k}: {v}")
    if not stats["total_fixed"]:
        print("No &# entity rows found (or already clean).")


if __name__ == "__main__":
    main()
