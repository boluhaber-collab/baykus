"""Bayat taksit/masraf ↔ kasa/banka bağlarını onar + bilinen kayıp hareketleri geri koy.

Kök neden (bkz. movement_links): SQLite id yeniden kullanımı + FK zorlanmaması
yüzünden kredi taksiti / masraf, artık başka kayda ait bir hareket id'sini
gösteriyordu. Kredi Düzenle/İptal bu id'yi silince işyerinde AKBANK'taki
"Kapora SIP-2026-003" (01.10.2026, 1.250,00 TL giriş) silindi.

Bu rutin idempotenttir, her açılışta çalışır:
  1. Hareketi olmayan ya da başka kayda ait harekete işaret eden taksit /
     masraf bağlarını NULL yapar (hareketlere, tutarlara dokunmaz).
  2. KNOWN_RESTORES listesindeki, yedekten kesin olarak bilinen silinmiş
     hareketleri; ilgili sipariş tahsilatı duruyor ve aynı açıklamalı hareket
     hiçbir hesapta yokken bir kez geri ekler (app_settings işareti ile).
Değişiklik varsa önce baykus.db.before_akbank_fix_<zaman> yedeği alınır ve
yapılan her şey movement_link_repair.log dosyasına yazılır.
BH_IMPORT hareketlerine ve tutarlarına hiç dokunulmaz.

Elle kuru çalıştırma:  python -m app.services.movement_link_repair --dry-run
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.movement_links import expense_movement_ok, loan_movement_ok

# Workplace yedeğinden (once_guncelle_20261016 + 27.10 kopyaları) doğrulanmış satır.
KNOWN_RESTORES: list[dict[str, Any]] = [
    {
        "key": "akbank_kapora_sip_2026_003",
        "bank_account_id": 5,
        "bank_account_name": "AKBANK",
        "movement_type": "deposit",
        "amount": "1250.00",
        "movement_date": "2026-10-01",
        "note": "Kapora SIP-2026-003",
        "created_by_user_id": 1,
        "created_at": "2026-10-01 09:32:41.280172",
        "order_number": "SIP-2026-003",
    },
]

_MARK_PREFIX = "repair.movement_link."


def _rows(conn, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    cur = conn.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _tables(conn) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def plan(conn) -> dict[str, Any]:
    """Compute changes without writing."""
    tabs = _tables(conn)
    need = {"bank_movements", "cash_movements", "loan_installments", "expenses"}
    if not need <= tabs:
        return {"unlink": [], "restore": [], "skipped": "tables missing"}
    mov = {
        "bank": {r["id"]: r for r in _rows(conn, "SELECT * FROM bank_movements")},
        "cash": {r["id"]: r for r in _rows(conn, "SELECT * FROM cash_movements")},
    }
    insts = _rows(conn, "SELECT * FROM loan_installments")
    exps = _rows(conn, "SELECT * FROM expenses")
    unlink: list[dict[str, Any]] = []
    for kind in ("bank", "cash"):
        col = f"{kind}_movement_id"
        loan_ref: dict[int, int] = {}
        for i in insts:
            if i.get(col):
                loan_ref[i[col]] = loan_ref.get(i[col], 0) + 1
        exp_amts: dict[int, list[Any]] = {}
        for e in exps:
            if e.get(col):
                exp_amts.setdefault(e[col], []).append(e.get("amount"))
        for i in insts:
            mid = i.get(col)
            if not mid:
                continue
            m = mov[kind].get(mid)
            ok, why = loan_movement_ok(
                kind, i, m, sharers=loan_ref.get(mid, 0), expense_refs=len(exp_amts.get(mid, []))
            )
            if not ok:
                unlink.append({
                    "table": "loan_installments", "id": i["id"], "col": col, "movement_id": mid,
                    "why": why, "info": f"kredi {i.get('loan_id')} taksit #{i.get('sequence')}",
                    "movement": _brief(m),
                })
        for e in exps:
            mid = e.get(col)
            if not mid:
                continue
            m = mov[kind].get(mid)
            ok, why = expense_movement_ok(
                kind, e, m, sharer_amounts=exp_amts.get(mid, []), loan_refs=loan_ref.get(mid, 0)
            )
            if not ok:
                unlink.append({
                    "table": "expenses", "id": e["id"], "col": col, "movement_id": mid,
                    "why": why,
                    "info": f"masraf {e.get('amount')} {e.get('expense_date')} (iptal={e.get('is_cancelled')})",
                    "movement": _brief(m),
                })

    restore: list[dict[str, Any]] = []
    marks = set()
    if "app_settings" in tabs:
        marks = {r[0] for r in conn.execute("SELECT key FROM app_settings WHERE key LIKE ?", (_MARK_PREFIX + "%",))}
    for kr in KNOWN_RESTORES:
        if _MARK_PREFIX + kr["key"] in marks:
            continue
        acc = conn.execute("SELECT name FROM bank_accounts WHERE id = ?", (kr["bank_account_id"],)).fetchone()
        if not acc or (acc[0] or "").strip().upper() != kr["bank_account_name"].upper():
            continue
        if "orders" not in tabs or "payments" not in tabs:
            continue
        pay = conn.execute(
            "SELECT p.amount FROM payments p JOIN orders o ON o.id = p.order_id "
            "WHERE o.order_number = ? AND p.notes = ?",
            (kr["order_number"], kr["note"]),
        ).fetchone()
        if not pay or f"{float(pay[0]):.2f}" != kr["amount"]:
            continue
        exists = conn.execute(
            "SELECT 1 FROM bank_movements WHERE note = ? UNION ALL SELECT 1 FROM cash_movements WHERE note = ?",
            (kr["note"], kr["note"]),
        ).fetchone()
        if exists:
            continue
        restore.append(kr)
    return {"unlink": unlink, "restore": restore}


def _brief(m: dict | None) -> str | None:
    if not m:
        return None
    acc = m.get("bank_account_id") or m.get("cash_register_id")
    return f"#{m['id']} hesap {acc} {m.get('movement_type')} {m.get('amount')} {m.get('movement_date')} {(m.get('note') or '')[:60]}"


def _balances(conn) -> dict[int, str]:
    out = {}
    for r in conn.execute(
        "SELECT a.id, a.opening_balance + COALESCE(SUM(CASE WHEN m.movement_type IN ('deposit','transfer_in') "
        "THEN m.amount WHEN m.movement_type IN ('withdrawal','transfer_out') THEN -m.amount ELSE 0 END),0) "
        "FROM bank_accounts a LEFT JOIN bank_movements m ON m.bank_account_id = a.id GROUP BY a.id"
    ):
        out[r[0]] = f"{float(r[1]):.2f}"
    return out


def apply(conn, p: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
    for u in p["unlink"]:
        conn.execute(
            f"UPDATE {u['table']} SET {u['col']} = NULL WHERE id = ? AND {u['col']} = ?",
            (u["id"], u["movement_id"]),
        )
    restored_ids = []
    for kr in p["restore"]:
        cur = conn.execute(
            "INSERT INTO bank_movements (bank_account_id, movement_type, amount, movement_date, category, note, "
            "created_by_user_id, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
            (kr["bank_account_id"], kr["movement_type"], kr["amount"], kr["movement_date"], kr["note"],
             kr["created_by_user_id"], kr["created_at"]),
        )
        restored_ids.append(cur.lastrowid)
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
            (_MARK_PREFIX + kr["key"], json.dumps({"bank_movement_id": cur.lastrowid}), now),
        )
    return {"restored_ids": restored_ids}


def _db_path() -> Path | None:
    from app.db.session import engine

    if engine.url.get_backend_name() != "sqlite":
        return None
    db = engine.url.database
    if not db or db == ":memory:":
        return None
    return Path(db).resolve()


def run_startup_repair(dry_run: bool = False, db_path: str | Path | None = None) -> dict[str, Any]:
    try:
        path = Path(db_path).resolve() if db_path else _db_path()
        if not path or not path.exists():
            return {"ok": True, "skipped": "no sqlite db"}
        conn = sqlite3.connect(str(path), timeout=30)
        try:
            p = plan(conn)
            if p.get("skipped"):
                return {"ok": True, "skipped": p["skipped"]}
            n_un, n_re = len(p["unlink"]), len(p["restore"])
            summary: dict[str, Any] = {"ok": True, "unlinked": n_un, "restored": n_re, "dry_run": dry_run}
            if dry_run or (n_un == 0 and n_re == 0):
                if dry_run:
                    summary["plan"] = p
                return summary
            before = _balances(conn)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup = path.with_name(f"{path.name}.before_akbank_fix_{ts}")
            bconn = sqlite3.connect(str(backup))
            with bconn:
                conn.backup(bconn)
            bconn.close()
            with conn:
                res = apply(conn, p)
            after = _balances(conn)
            changed = {k: (before.get(k), v) for k, v in after.items() if before.get(k) != v}
            summary.update({"backup": backup.name, "restored_ids": res["restored_ids"], "balance_changes": changed})
            try:
                with open(path.with_name("movement_link_repair.log"), "a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"at": ts, **summary, "plan": p}, ensure_ascii=False, default=str) + "\n")
            except Exception:  # noqa: BLE001
                pass
            return summary
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    out = run_startup_repair(dry_run=dry, db_path=args[0] if args else None)
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
