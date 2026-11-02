"""Varyant kataloğu (Ayarlar > Varyant Yönetimi) ↔ ürün varyantları köprüsü.

Tür → product_variants sütunu: Renk → color, Beden → size, Baskı → print_type.
Ürün kartındaki VARYANT sekmesi açılır listeleri bu katalogdan beslenir;
ürüne yazılan yeni bir değer kayıtta kataloğa eklenir.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

KIND_COLUMNS: dict[str, str] = {"Renk": "color", "Beden": "size", "Baskı": "print_type"}
KIND_ORDER = ["Renk", "Beden", "Baskı"]

_TR_ASCII = str.maketrans("İIıŞşĞğÜüÖöÇç", "IIiSsGgUuOoCc")
_TR_ALPHA = "0123456789aâbcçdefgğhıiîjklmnoöpqrsştuüûvwxyz"
_SEP = re.compile(r"(\s+--\s+|\s+/\s+)")


def norm_key(value: str | None) -> str:
    return " ".join((value or "").translate(_TR_ASCII).casefold().split())


def tr_upper(value: str) -> str:
    return (value or "").replace("i", "İ").replace("ı", "I").upper()


def tr_sort_key(value: str) -> tuple:
    low = (value or "").replace("I", "ı").replace("İ", "i").lower()
    return tuple(_TR_ALPHA.index(ch) if ch in _TR_ALPHA else 100 + ord(ch) for ch in low)


def canonical_kind(kind: str | None) -> str:
    k = norm_key(kind)
    for name in KIND_COLUMNS:
        if norm_key(name) == k:
            return name
    aliases = {"color": "Renk", "size": "Beden", "print_type": "Baskı", "baski turu": "Baskı"}
    return aliases.get(k, (kind or "").strip())


def column_for(kind: str) -> str | None:
    return KIND_COLUMNS.get(canonical_kind(kind))


def sorted_seed_values(kind: str, values: list[str]) -> list[str]:
    uniq: dict[str, str] = {}
    for v in values:
        t = (v or "").strip()
        if t and norm_key(t) not in uniq:
            uniq[norm_key(t)] = t
    vals = list(uniq.values())
    if kind == "Beden":
        from app.utils.size_sort import size_sort_key

        vals.sort(key=size_sort_key)
    else:
        vals.sort(key=tr_sort_key)
    return vals


def usage_counts(db: Session, kind: str) -> dict[str, dict[str, Any]]:
    """norm_key → {value, variant_count, product_count, visible_count} (gizliler dahil)."""
    from app.models.product import ProductVariant

    col_name = column_for(kind)
    if not col_name:
        return {}
    col = getattr(ProductVariant, col_name)
    rows = (
        db.query(col, ProductVariant.product_id, ProductVariant.is_hidden)
        .filter(col.isnot(None), col != "")
        .all()
    )
    out: dict[str, dict[str, Any]] = {}
    for value, pid, hidden in rows:
        t = (value or "").strip()
        if not t:
            continue
        k = norm_key(t)
        e = out.setdefault(
            k, {"value": t, "variant_count": 0, "visible_count": 0, "products": set()}
        )
        e["variant_count"] += 1
        if not hidden:
            e["visible_count"] += 1
        e["products"].add(pid)
    for e in out.values():
        e["product_count"] = len(e.pop("products"))
    return out


def options_for_kind(db: Session, kind: str):
    from app.models.variant_option import VariantOption

    kind = canonical_kind(kind)
    rows = db.query(VariantOption).all()
    return sorted(
        [r for r in rows if canonical_kind(r.kind) == kind],
        key=lambda r: (r.sort_order or 0, r.id),
    )


def next_sort_order(db: Session, kind: str) -> int:
    opts = options_for_kind(db, kind)
    return (max((o.sort_order or 0) for o in opts) + 1) if opts else 0


def ensure_options(db: Session, values_by_kind: dict[str, list[str | None]]) -> int:
    """Ürün kaydında kullanılan ve katalogda olmayan değerleri sona ekle."""
    from app.models.variant_option import VariantOption

    added = 0
    for kind, values in values_by_kind.items():
        kind = canonical_kind(kind)
        if kind not in KIND_COLUMNS:
            continue
        known = {norm_key(o.value) for o in options_for_kind(db, kind)}
        order = next_sort_order(db, kind)
        for v in values:
            t = (v or "").strip()
            if not t or norm_key(t) in known:
                continue
            db.add(VariantOption(kind=kind, value=t[:120], sort_order=order))
            known.add(norm_key(t))
            order += 1
            added += 1
    if added:
        db.flush()
    return added


def sync_missing(db: Session, kind: str) -> int:
    kind = canonical_kind(kind)
    usage = usage_counts(db, kind)
    known = {norm_key(o.value) for o in options_for_kind(db, kind)}
    missing = [e["value"] for k, e in usage.items() if k not in known]
    return ensure_options(db, {kind: sorted_seed_values(kind, missing)})


def _replace_tokens(name: str, old: str, new: str) -> str:
    ok = norm_key(old)
    parts = _SEP.split(name or "")
    changed = False
    for i in range(0, len(parts), 2):
        if norm_key(parts[i]) == ok:
            parts[i] = new
            changed = True
    return "".join(parts) if changed else name


def propagate_rename(db: Session, kind: str, old: str, new: str) -> int:
    """Ürün varyantlarında eski değeri yenisiyle değiştir (ad dahil). Çakışma varsa hata."""
    from fastapi import HTTPException

    from app.models.product import Product, ProductVariant

    col_name = column_for(kind)
    if not col_name or old == new:
        return 0
    col = getattr(ProductVariant, col_name)
    ok = norm_key(old)
    candidates = [
        v
        for v in db.query(ProductVariant).filter(col.isnot(None), col != "").all()
        if norm_key(getattr(v, col_name)) == ok
    ]
    if not candidates:
        return 0
    if norm_key(old) != norm_key(new):
        pids = {v.product_id for v in candidates}
        cand_ids = {v.id for v in candidates}

        def ident(v, override: str | None = None):
            vals = {c: getattr(v, c) for c in ("color", "size", "print_type")}
            if override is not None:
                vals[col_name] = override
            return (norm_key(vals["color"]), norm_key(vals["size"]), norm_key(vals["print_type"]))

        clashes: list[str] = []
        for pid in pids:
            siblings = db.query(ProductVariant).filter(ProductVariant.product_id == pid).all()
            others = {ident(s) for s in siblings if s.id not in cand_ids}
            for v in siblings:
                if v.id in cand_ids and ident(v, new) in others:
                    p = db.get(Product, pid)
                    clashes.append(f"{p.name if p else pid}: {v.name}")
                    break
        if clashes:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"'{new}' değeri {len(clashes)} üründe zaten ayrı bir varyant olarak var "
                    f"(örn. {', '.join(clashes[:3])}). Yeniden adlandırma bu ürünlerde "
                    "mükerrer varyant oluşturur; önce ürün kartından birleştirin."
                ),
            )
    for v in candidates:
        setattr(v, col_name, new)
        v.name = _replace_tokens(v.name, old, new)[:255]
    db.flush()
    return len(candidates)


def run_startup_migrate() -> dict[str, Any]:
    """variant_options.sort_order sütunu + katalog boşsa ürünlerdeki değerlerle doldur."""
    try:
        from sqlalchemy import inspect, text

        from app.db.session import SessionLocal, engine
        from app.models.variant_option import VariantOption
        from app.utils.size_sort import size_sort_key

        insp = inspect(engine)
        added_col = False
        if "variant_options" not in insp.get_table_names():
            VariantOption.__table__.create(bind=engine, checkfirst=True)
        else:
            cols = {c["name"] for c in insp.get_columns("variant_options")}
            if "sort_order" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE variant_options "
                            "ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
                        )
                    )
                added_col = True
        seeded: dict[str, int] = {}
        db = SessionLocal()
        try:
            if added_col:
                # Eski kayıtlar: tür içinde değer sırasına göre numarala
                for kind in {canonical_kind(r.kind) for r in db.query(VariantOption).all()}:
                    opts = sorted(
                        [r for r in db.query(VariantOption).all() if canonical_kind(r.kind) == kind],
                        key=lambda r: (
                            size_sort_key(r.value) if kind == "Beden" else tr_sort_key(r.value)
                        ),
                    )
                    for i, r in enumerate(opts):
                        r.sort_order = i
            for kind in KIND_ORDER:
                if not options_for_kind(db, kind):
                    n = sync_missing(db, kind)
                    if n:
                        seeded[kind] = n
            db.commit()
        finally:
            db.close()
        return {"ok": True, "added_col": added_col, "seeded": seeded}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
