#!/usr/bin/env python3
"""Scrape BizimHesap newportal KPIs → apps/api/data/bh_dashboard_kpis.json.

Optionally deactivate OOS bank accounts so local Banka Bakiyesi matches BH.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from app.services.bh_portal_kpis import (  # noqa: E402
    OOS_BANK_ACCOUNT_NAMES,
    get_bh_dashboard_kpis,
    is_oos_bank_account,
    save_cache,
    scrape_live,
)


def apply_oos_deactivate(db_url: str) -> list[str]:
    """Deactivate OOS bank accounts. Prefer SQLAlchemy; fall back to sqlite3."""
    changed: list[str] = []
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.models.finance import BankAccount

        eng = create_engine(db_url)
        Session = sessionmaker(bind=eng)
        db = Session()
        try:
            for acc in db.query(BankAccount).all():
                if is_oos_bank_account(acc.name, getattr(acc, "notes", None)):
                    if acc.is_active:
                        acc.is_active = False
                        changed.append(acc.name)
            db.commit()
        finally:
            db.close()
        return changed
    except Exception:
        pass

    # sqlite fallback (box without venv)
    import sqlite3
    from urllib.parse import urlparse

    path = db_url.replace("sqlite:///", "")
    if path.startswith("./"):
        path = str(ROOT / path[2:])
    con = sqlite3.connect(path)
    cur = con.cursor()
    for rid, name, notes, active in cur.execute(
        "SELECT id, name, notes, is_active FROM bank_accounts"
    ).fetchall():
        if is_oos_bank_account(name, notes) and active:
            cur.execute("UPDATE bank_accounts SET is_active=0 WHERE id=?", (rid,))
            changed.append(name)
    con.commit()
    con.close()
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=None, help="Cache JSON path")
    ap.add_argument(
        "--apply-oos",
        action="store_true",
        help=f"Deactivate OOS bank accounts: {', '.join(sorted(OOS_BANK_ACCOUNT_NAMES))}",
    )
    ap.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", "sqlite:///./baykus.db"),
    )
    args = ap.parse_args()

    data = scrape_live()
    path = save_cache(data, args.out)
    print(
        "BH KPIs:",
        f"ciro={data.get('orders_month_revenue')}",
        f"masraf={data.get('month_expenses')}",
        f"net={data.get('month_net_profit')}",
        f"kasa={data.get('cash_balance')}",
        f"banka={data.get('bank_balance')}",
        f"label={data.get('month_label')}",
    )
    print(f"Cached → {path}")

    if args.apply_oos:
        changed = apply_oos_deactivate(args.database_url)
        print("OOS deactivated:", changed or "(none already inactive)")

    # warm memory via getter
    get_bh_dashboard_kpis(force_refresh=False, allow_network=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
