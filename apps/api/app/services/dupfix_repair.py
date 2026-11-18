"""Çift stok hareketi onarımı + çift satış/tahsilat raporu.

Stok (otomatik, güvenli):
  Her satış için stok hareketlerinin net etkisi (Satış / İptal iade / Satış düzenleme /
  Satış iptali notları) siparişin satırlarıyla karşılaştırılır. Net düşüm beklenenden
  fazlaysa VE fazlalık, aynı ürün/varyant/adetle birkaç saniye arayla yazılmış birebir
  aynı 'Satış SIP-…' hareketlerinden geliyorsa (sistem çift kaydı) fazla hareket silinir
  ve stok o adet kadar geri eklenir. Diğer tutarsızlıklar yalnızca raporlanır.

Finans (YALNIZCA rapor, hiçbir şey silinmez):
  * Aynı müşteri/tutar/satırlarla 15 dk içinde açılmış iki aktif satış (olası çift satış)
  * Satışla birlikte alınmış tahsilat + aynı müşteriye aynı tutarda ayrı "Tahsilat Al"
    kaydı, müşteri bakiyesi alacaklıya dönmüşse (olası çift tahsilat)
  * Aynı siparişe aynı tutar/açıklamayla 60 sn içinde iki ödeme satırı

Değişiklik olursa önce baykus.db.before_dupfix_<zaman> yedeği alınır, yapılan her şey
dupfix_repair.log dosyasına yazılır. İdempotenttir (ikinci çalıştırmada aday kalmaz).
BH_IMPORT kayıtlarına dokunulmaz.

Elle kuru çalıştırma:  python -m app.services.dupfix_repair --dry-run [db_yolu]
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

_NOTE_RE = re.compile(r"^\s*(Satış düzenleme|Satış iptali|Satış|İptal iade)\s+(\S+)\s*$")
_DUP_WINDOW_SEC = 120


def _ts(v: Any) -> datetime | None:
    if not v:
        return None
    s = str(v).replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            continue
    return None


def _f(v: Any) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def plan_stock(conn: sqlite3.Connection) -> dict[str, Any]:
    orders = {
        r[1]: {"id": r[0], "status": r[2]}
        for r in conn.execute("SELECT id, order_number, status FROM orders")
    }
    ptype = {r[0]: (r[1] or "stoklu") for r in conn.execute("SELECT id, product_type FROM products")}
    vprod = {r[0]: r[1] for r in conn.execute("SELECT id, product_id FROM product_variants")}

    expected: dict[str, dict[tuple, int]] = defaultdict(lambda: defaultdict(int))
    oid_to_no = {v["id"]: k for k, v in orders.items()}
    for oid, pid, vid, qty in conn.execute(
        "SELECT order_id, product_id, variant_id, quantity FROM order_lines"
    ):
        no = oid_to_no.get(oid)
        if not no or not pid or pid not in ptype or ptype[pid] == "hizmet" or int(qty or 0) <= 0:
            continue
        if vid and vprod.get(vid) != pid:
            continue
        expected[no][(pid, vid or None)] += int(qty)

    movs: dict[str, list[dict]] = defaultdict(list)
    for mid, pid, vid, direction, qty, reason, note, created in conn.execute(
        "SELECT id, product_id, variant_id, direction, quantity, reason, note, created_at "
        "FROM stock_movements WHERE reason IN ('sale','sale_cancel','sale_edit') ORDER BY id"
    ):
        m = _NOTE_RE.match(note or "")
        if not m:
            continue
        movs[m.group(2)].append(
            {
                "id": mid,
                "product_id": pid,
                "variant_id": vid,
                "direction": direction,
                "quantity": int(qty or 0),
                "reason": reason,
                "note": note,
                "created_at": created,
            }
        )

    remove: list[dict] = []
    mismatches: list[dict] = []
    for no, rows in movs.items():
        o = orders.get(no)
        if o is None:
            continue  # sipariş silinmiş: hareketler geçmiş olarak kalır
        cancelled = o["status"] == "Sipariş İptali"
        exp = {} if cancelled else dict(expected.get(no, {}))
        actual: dict[tuple, int] = defaultdict(int)
        for r in rows:
            k = (r["product_id"], r["variant_id"])
            actual[k] += r["quantity"] if r["direction"] == "decrease" else -r["quantity"]
        for k in set(actual) | set(exp):
            excess = actual.get(k, 0) - exp.get(k, 0)
            if excess == 0:
                continue
            fixed = 0
            if excess > 0:
                sales = [
                    r for r in rows
                    if (r["product_id"], r["variant_id"]) == k and r["reason"] == "sale" and r["direction"] == "decrease"
                ]
                # birebir aynı ve birkaç saniye arayla yazılmış satış hareketleri = sistem çift kaydı
                for i, a in enumerate(sales):
                    for b in sales[i + 1:]:
                        if excess - fixed < b["quantity"] or b["quantity"] != a["quantity"]:
                            continue
                        if any(x["id"] == b["id"] for x in remove) or any(x["id"] == a["id"] for x in remove):
                            continue
                        ta, tb = _ts(a["created_at"]), _ts(b["created_at"])
                        if ta and tb and abs((tb - ta).total_seconds()) <= _DUP_WINDOW_SEC:
                            remove.append({**b, "order_number": no, "duplicate_of": a["id"]})
                            fixed += b["quantity"]
            if excess - fixed != 0:
                mismatches.append(
                    {
                        "order_number": no,
                        "status": o["status"],
                        "product_id": k[0],
                        "variant_id": k[1],
                        "expected_qty": exp.get(k, 0),
                        "net_stock_out": actual.get(k, 0) - fixed,
                    }
                )
    return {"remove": remove, "mismatches": mismatches}


def plan_finance(conn: sqlite3.Connection) -> dict[str, Any]:
    tables = _tables(conn)
    out: dict[str, Any] = {"duplicate_orders": [], "double_tahsilat": [], "duplicate_payments": []}

    # Olası çift satış
    sig: dict[int, str] = defaultdict(str)
    lines: dict[int, list] = defaultdict(list)
    for oid, pid, vid, qty, price in conn.execute(
        "SELECT order_id, product_id, variant_id, quantity, unit_price FROM order_lines"
    ):
        lines[oid].append((pid or 0, vid or 0, int(qty or 0), _f(price)))
    for oid, ls in lines.items():
        sig[oid] = json.dumps(sorted(ls))
    active = [
        r
        for r in conn.execute(
            "SELECT id, order_number, customer_id, total_amount, created_at, notes FROM orders "
            "WHERE status != 'Sipariş İptali' ORDER BY id"
        )
    ]
    for i, a in enumerate(active):
        for b in active[i + 1:]:
            if a[2] != b[2] or _f(a[3]) != _f(b[3]) or sig.get(a[0]) != sig.get(b[0]) or not sig.get(a[0]):
                continue
            if a[2] is None and (a[5] or "").split("·")[0].strip() != (b[5] or "").split("·")[0].strip():
                continue
            ta, tb = _ts(a[4]), _ts(b[4])
            if ta and tb and abs((tb - ta).total_seconds()) <= 15 * 60:
                out["duplicate_orders"].append(
                    {"orders": [a[1], b[1]], "customer_id": a[2], "total": _f(a[3]), "created_at": [a[4], b[4]]}
                )

    # Olası çift tahsilat (satışta alınan + ayrıca Tahsilat Al), müşteri alacaklı ise
    if "cari_movements" in tables:
        bal = {}
        for cid, opening in conn.execute("SELECT id, opening_balance FROM customers"):
            bal[cid] = _f(opening)
        for cid, d, c in conn.execute(
            "SELECT customer_id, COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) FROM cari_movements GROUP BY customer_id"
        ):
            bal[cid] = round(bal.get(cid, 0.0) + _f(d) - _f(c), 2)
        pays = defaultdict(list)
        for mid, cid, credit, mdate, oid, note in conn.execute(
            "SELECT id, customer_id, credit, movement_date, order_id, note FROM cari_movements "
            "WHERE movement_type IN ('payment','deposit') AND credit > 0 AND COALESCE(note,'') NOT LIKE '%BH_IMPORT:%'"
        ):
            pays[cid].append((mid, _f(credit), mdate, oid, note))
        for cid, rows in pays.items():
            if bal.get(cid, 0) >= 0:
                continue
            with_order = [r for r in rows if r[3]]
            free = [r for r in rows if not r[3]]
            for a in with_order:
                for b in free:
                    if a[1] != b[1]:
                        continue
                    da, db_ = _ts(a[2]), _ts(b[2])
                    if da and db_ and abs((db_ - da).days) <= 7:
                        out["double_tahsilat"].append(
                            {
                                "customer_id": cid,
                                "balance": bal.get(cid),
                                "sale_payment_cari_id": a[0],
                                "extra_tahsilat_cari_id": b[0],
                                "amount": a[1],
                                "dates": [a[2], b[2]],
                                "notes": [a[4], b[4]],
                            }
                        )

    # Aynı siparişe çift ödeme satırı
    has_alloc = "cari_movement_id" in {r[1] for r in conn.execute("PRAGMA table_info(payments)")}
    q = "SELECT id, order_id, amount, notes, paid_at" + (", cari_movement_id" if has_alloc else ", NULL") + " FROM payments ORDER BY id"
    by_order = defaultdict(list)
    for r in conn.execute(q):
        by_order[r[1]].append(r)
    for oid, rows in by_order.items():
        for i, a in enumerate(rows):
            for b in rows[i + 1:]:
                if a[5] is not None or b[5] is not None:
                    continue
                if _f(a[2]) != _f(b[2]) or (a[3] or "") != (b[3] or ""):
                    continue
                ta, tb = _ts(a[4]), _ts(b[4])
                if ta and tb and abs((tb - ta).total_seconds()) <= 60:
                    out["duplicate_payments"].append({"order_id": oid, "payment_ids": [a[0], b[0]], "amount": _f(a[2])})
    return out


def _stock_targets(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "variants": conn.execute("SELECT COALESCE(SUM(stock_qty),0) FROM product_variants").fetchone()[0],
        "products": conn.execute("SELECT COALESCE(SUM(stock_qty),0) FROM products").fetchone()[0],
    }


def apply_stock(conn: sqlite3.Connection, remove: list[dict]) -> list[int]:
    touched_products: set[int] = set()
    done: list[int] = []
    for r in remove:
        q = int(r["quantity"])
        if r["variant_id"]:
            conn.execute("UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?", (q, r["variant_id"]))
        else:
            conn.execute("UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?", (q, r["product_id"]))
        conn.execute("DELETE FROM stock_movements WHERE id = ?", (r["id"],))
        touched_products.add(r["product_id"])
        done.append(r["id"])
    for pid in touched_products:
        n = conn.execute("SELECT COUNT(*) FROM product_variants WHERE product_id = ?", (pid,)).fetchone()[0]
        if n:
            conn.execute(
                "UPDATE products SET stock_qty = (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants WHERE product_id = ?) WHERE id = ?",
                (pid, pid),
            )
    return done


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
            if not {"orders", "order_lines", "stock_movements", "products"} <= _tables(conn):
                return {"ok": True, "skipped": "tables missing"}
            sp = plan_stock(conn)
            fp = plan_finance(conn)
            summary: dict[str, Any] = {
                "ok": True,
                "dry_run": dry_run,
                "stock_duplicates": len(sp["remove"]),
                "stock_mismatches": len(sp["mismatches"]),
                "duplicate_orders": len(fp["duplicate_orders"]),
                "double_tahsilat": len(fp["double_tahsilat"]),
                "duplicate_payments": len(fp["duplicate_payments"]),
            }
            if dry_run:
                summary["plan"] = {"stock": sp, "finance": fp}
                return summary
            if not sp["remove"]:
                if fp["duplicate_orders"] or fp["double_tahsilat"] or fp["duplicate_payments"]:
                    # Finans bulguları yalnızca raporlanır (yönetici kontrol eder, silinmez)
                    try:
                        with open(path.with_name("dupfix_repair.log"), "a", encoding="utf-8") as fh:
                            fh.write(
                                json.dumps(
                                    {"at": datetime.now().strftime("%Y%m%d_%H%M%S"), **summary, "finance": fp},
                                    ensure_ascii=False,
                                    default=str,
                                )
                                + "\n"
                            )
                    except Exception:  # noqa: BLE001
                        pass
                return summary
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup = path.with_name(f"{path.name}.before_dupfix_{ts}")
            bconn = sqlite3.connect(str(backup))
            with bconn:
                conn.backup(bconn)
            bconn.close()
            before = _stock_targets(conn)
            with conn:
                removed = apply_stock(conn, sp["remove"])
            summary.update(
                {"backup": backup.name, "removed_movement_ids": removed, "stock_totals": [before, _stock_targets(conn)]}
            )
            try:
                with open(path.with_name("dupfix_repair.log"), "a", encoding="utf-8") as fh:
                    fh.write(
                        json.dumps({"at": ts, **summary, "plan": {"stock": sp, "finance": fp}}, ensure_ascii=False, default=str)
                        + "\n"
                    )
            except Exception:  # noqa: BLE001
                pass
            return summary
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = run_startup_repair(dry_run="--dry-run" in sys.argv, db_path=args[0] if args else None)
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
