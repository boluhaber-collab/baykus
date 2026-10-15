"""Virman / hesaplar arası transfer — açıklama ve tip mantığı.

Muhasebe: transfer gelir (tahsilat) ya da gider değildir. Kaynak hesaba
"Virman çıkışı → <hedef>", hedef hesaba "Virman girişi ← <kaynak>" yazılır;
iki bacak transfer_group_id ile bağlıdır, tip transfer_out / transfer_in,
cari etkisi yoktur.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

OUT_PREFIX = "Virman çıkışı →"
IN_PREFIX = "Virman girişi ←"

_LEGACY_RES = [
    re.compile(r"^\s*.+?\s+hesab[ıi]ndan\s+.+?\s+hesab[ıi]na\s+transfer\s*(?:-\s*)?", re.IGNORECASE),
    re.compile(r"^\s*Virman\s+(?:çıkışı|girişi)\s*[→←]\s*[^·]*(?:·\s*)?", re.IGNORECASE),
    re.compile(r"^\s*(?:Transfer\s*/\s*Virman|Virman|Transfer|Tahsilat|Para Girişi|Para Çıkışı|Ödeme)\s*$", re.IGNORECASE),
]


def extract_user_note(note: str | None) -> str:
    """Strip auto-generated transfer text; keep only the user's own extra note."""
    t = (note or "").strip()
    if not t:
        return ""
    for rx in _LEGACY_RES:
        t = rx.sub("", t, count=1).strip()
    return t.strip(" -·")


def _tr_date(d: date | None) -> str:
    return d.strftime("%d.%m.%Y") if d else ""


def leg_note(direction: str, counterpart: str | None, user_note: str | None = None) -> str:
    cp = (counterpart or "").strip() or "Hesap"
    base = f"{OUT_PREFIX} {cp}" if direction == "out" else f"{IN_PREFIX} {cp}"
    extra = extract_user_note(user_note)
    return f"{base} · {extra}" if extra else base


CASH_FIX = {"tahsilat": "transfer_in", "odeme": "transfer_out", "gider": "transfer_out"}
BANK_FIX = {"deposit": "transfer_in", "withdrawal": "transfer_out"}
CASH_IN = {"tahsilat", "transfer_in"}
BANK_IN = {"deposit", "transfer_in"}


def run_startup_migrate() -> dict[str, Any]:
    """Idempotent: fix past transfer legs labelled tahsilat/ödeme. Amounts untouched."""
    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        if not {"cash_movements", "bank_movements"} <= tables:
            return {"ok": True, "skipped": "no tables"}

        retyped = 0
        relabeled = 0
        groups = 0
        with engine.begin() as conn:
            cash_names = dict(conn.execute(text("SELECT id, name FROM cash_registers")).fetchall())
            bank_names = dict(conn.execute(text("SELECT id, name FROM bank_accounts")).fetchall())
            legs: dict[str, list[dict]] = {}
            for r in conn.execute(text(
                "SELECT id, cash_register_id, movement_type, note, transfer_group_id "
                "FROM cash_movements WHERE transfer_group_id IS NOT NULL"
            )).fetchall():
                legs.setdefault(r[4], []).append({
                    "tbl": "cash_movements", "id": r[0], "acc": cash_names.get(r[1]) or "Kasa",
                    "type": r[2], "note": r[3],
                    "dir": "in" if r[2] in CASH_IN else "out", "fix": CASH_FIX,
                })
            for r in conn.execute(text(
                "SELECT id, bank_account_id, movement_type, note, transfer_group_id "
                "FROM bank_movements WHERE transfer_group_id IS NOT NULL"
            )).fetchall():
                legs.setdefault(r[4], []).append({
                    "tbl": "bank_movements", "id": r[0], "acc": bank_names.get(r[1]) or "Banka",
                    "type": r[2], "note": r[3],
                    "dir": "in" if r[2] in BANK_IN else "out", "fix": BANK_FIX,
                })
            for gid, rows in legs.items():
                if len(rows) != 2:
                    continue
                dirs = {x["dir"] for x in rows}
                if dirs != {"in", "out"}:
                    continue
                if any("BH_IMPORT" in (x["note"] or "") for x in rows):
                    continue  # locked BH rows — never touch
                groups += 1
                a, b = rows
                for leg, peer in ((a, b), (b, a)):
                    new_type = leg["fix"].get(leg["type"], leg["type"])
                    note = leg["note"] or ""
                    new_note = note
                    if not note.startswith(OUT_PREFIX) and not note.startswith(IN_PREFIX):
                        new_note = leg_note(leg["dir"], peer["acc"], note)
                    if new_type != leg["type"]:
                        retyped += 1
                    if new_note != note:
                        relabeled += 1
                    if new_type != leg["type"] or new_note != note:
                        conn.execute(
                            text(f"UPDATE {leg['tbl']} SET movement_type=:t, note=:n WHERE id=:i"),
                            {"t": new_type, "n": new_note, "i": leg["id"]},
                        )
        return {"ok": True, "groups": groups, "retyped": retyped, "relabeled": relabeled}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc)}
