"""Ensure product_variants.is_hidden exists (SQLite create_all cannot ALTER existing tables).

Hareket görmüş bir varyant ürün kartından kaldırılınca silinmez, gizlenir
(is_hidden=1). Gizli varyantlar Product.variants listesine gelmez; geçmiş
hareketler/satış satırları varyant kaydına bağlı kalır.
"""

from __future__ import annotations

import logging

log = logging.getLogger("baykus.variant_schema_migrate")


def ensure_variant_hidden_column() -> bool:
    from sqlalchemy import inspect, text

    from app.db.session import engine

    insp = inspect(engine)
    if "product_variants" not in insp.get_table_names():
        return False
    cols = {c["name"] for c in insp.get_columns("product_variants")}
    if "is_hidden" in cols:
        return False
    default = "0" if engine.dialect.name == "sqlite" else "false"
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE product_variants ADD COLUMN is_hidden BOOLEAN "
                f"DEFAULT {default} NOT NULL"
            )
        )
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_product_variants_is_hidden "
                    "ON product_variants (is_hidden)"
                )
            )
        except Exception:  # noqa: BLE001
            pass
    log.info("added product_variants.is_hidden")
    return True


def run_startup_migrate() -> dict | None:
    try:
        added = ensure_variant_hidden_column()
        print(f"[baykus] product_variants.is_hidden migrate: column_added={added}", flush=True)
        return {"is_hidden_added": added}
    except Exception as exc:  # noqa: BLE001
        print(f"[baykus] product_variants.is_hidden migrate FAILED: {exc}", flush=True)
        return None
