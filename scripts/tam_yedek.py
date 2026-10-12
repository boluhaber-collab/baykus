"""Baykuş tam yedek / geri yükleme yardımcı aracı (yalnız Python stdlib).

Kullanım:
  python tam_yedek.py backup  --root <program klasörü> --out <zip yolu>
  python tam_yedek.py verify  --zip <zip>
  python tam_yedek.py restore --zip <zip> --root <hedef klasör>

Çıktının son satırı JSON'dur (panel okur). Şifre/sır yazdırılmaz.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

EXCLUDE_DIRS = {
    "node_modules", ".next", ".venv", "venv", "__pycache__", ".pytest_cache",
    ".ruff_cache", ".turbo", ".git", "Yedekler", "tmp", ".mypy_cache",
}
EXCLUDE_FILES_SUFFIX = (".pyc", ".pyo", ".db-journal", ".db-wal", ".db-shm", ".log")
KEY_TABLES = [
    "customers", "suppliers", "products", "sales", "sale_items", "purchases",
    "cash_accounts", "account_transactions", "ledger_entries", "cari_transactions",
    "expenses", "orders", "stock_movements", "users", "price_lists",
]
DB_REL = Path("apps/api/baykus.db")


def sqlite_backup(src: Path, dst: Path) -> None:
    """Online, tutarlı kopya (SQLite backup API)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=30)
    d = sqlite3.connect(str(dst))
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()


def db_stats(db: Path) -> dict:
    con = sqlite3.connect(str(db))
    try:
        integ = con.execute("PRAGMA integrity_check").fetchone()[0]
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {}
        for t in KEY_TABLES:
            if t in tables:
                counts[t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        return {"integrity": integ, "table_count": len(tables), "row_counts": counts}
    finally:
        con.close()


def git_commit(root: Path) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip() or None
    except Exception:
        return None


def iter_program_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        rel_dir = Path(dirpath).relative_to(root)
        for fn in filenames:
            rel = rel_dir / fn
            if rel.as_posix() == DB_REL.as_posix():
                continue  # tutarlı kopya ayrıca eklenir
            if fn.endswith(EXCLUDE_FILES_SUFFIX) or (fn.endswith(".zip") and rel_dir == Path(".")):
                continue
            if rel.parts[:3] == ("apps", "api", "backups") and fn.endswith(".zip"):
                continue
            yield Path(dirpath) / fn, rel.as_posix()


def cmd_backup(root: Path, out: Path) -> dict:
    root = root.resolve()
    db = root / DB_REL
    if not db.is_file():
        raise SystemExit(f"Veritabanı bulunamadı: {db}")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmpdir = Path(tempfile.mkdtemp(prefix="baykus_tamyedek_"))
    try:
        db_copy = tmpdir / "baykus.db"
        sqlite_backup(db, db_copy)
        stats = db_stats(db_copy)
        if stats["integrity"] != "ok":
            raise SystemExit(f"DB kopyası bütünlük hatası: {stats['integrity']}")
        manifest = {
            "app": "Baykus",
            "type": "tam_yedek",
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "source_root": str(root),
            "git_commit": git_commit(root),
            "db_size_bytes": db_copy.stat().st_size,
            **stats,
        }
        n = 0
        partial = out.with_suffix(".zip.part")
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            for full, arc in iter_program_files(root):
                try:
                    zf.write(full, arc)
                    n += 1
                except (PermissionError, OSError):
                    pass
            zf.write(db_copy, DB_REL.as_posix())
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        os.replace(partial, out)
        manifest["file_count"] = n + 2
        manifest["zip_path"] = str(out)
        manifest["zip_size_bytes"] = out.stat().st_size
        v = cmd_verify(out)
        manifest["verify"] = v
        return manifest
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def cmd_verify(zp: Path) -> dict:
    with zipfile.ZipFile(zp) as zf:
        bad = zf.testzip()
        names = set(zf.namelist())
        if bad:
            return {"ok": False, "message": f"Bozuk kayıt: {bad}"}
        if DB_REL.as_posix() not in names:
            return {"ok": False, "message": "Zip içinde baykus.db yok"}
        tmpdir = Path(tempfile.mkdtemp(prefix="baykus_verify_"))
        try:
            p = tmpdir / "baykus.db"
            with zf.open(DB_REL.as_posix()) as src, open(p, "wb") as dst:
                shutil.copyfileobj(src, dst)
            st = db_stats(p)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
    ok = st["integrity"] == "ok"
    return {"ok": ok, "message": "Zip ve veritabanı sağlam" if ok else st["integrity"],
            "entries": len(names), "has_kur": "KUR.bat" in names, **st}


def cmd_restore(zp: Path, root: Path) -> dict:
    v = cmd_verify(zp)
    if not v["ok"]:
        raise SystemExit("Yedek doğrulanamadı: " + v["message"])
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    db = root / DB_REL
    before = None
    if db.is_file():
        before = db.with_name(f"baykus.db.before_restore_{stamp}")
        sqlite_backup(db, before)
    with zipfile.ZipFile(zp) as zf:
        for m in zf.infolist():
            target = (root / m.filename).resolve()
            if not str(target).startswith(str(root)):
                continue  # zip-slip koruması
            if m.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(m) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    for ext in ("-wal", "-shm", "-journal"):
        p = Path(str(db) + ext)
        if p.exists():
            p.unlink()
    return {"ok": True, "root": str(root), "before_restore": str(before) if before else None,
            "row_counts": db_stats(db)["row_counts"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["backup", "verify", "restore"])
    ap.add_argument("--root")
    ap.add_argument("--out")
    ap.add_argument("--zip")
    a = ap.parse_args()
    try:
        if a.cmd == "backup":
            r = cmd_backup(Path(a.root), Path(a.out))
        elif a.cmd == "verify":
            r = cmd_verify(Path(a.zip))
        else:
            r = cmd_restore(Path(a.zip), Path(a.root))
    except SystemExit as e:
        r = {"ok": False, "message": str(e)}
    except Exception as e:  # noqa: BLE001
        r = {"ok": False, "message": f"{type(e).__name__}: {e}"}
    if "ok" not in r:
        r["ok"] = bool(r.get("verify", {}).get("ok"))
    sys.stdout.write(json.dumps(r, ensure_ascii=True) + "\n")
    sys.exit(0 if r.get("ok") else 1)


if __name__ == "__main__":
    main()
