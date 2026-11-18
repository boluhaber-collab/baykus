"""Ürün stok ekstresinde birbirini götüren hareket çiftlerini işaretler.

Eski sürümde satış düzenlemesi her kayıtta 'İptal iade SIP-…' + yeni 'Satış SIP-…'
hareketi yazıyordu (alış düzenlemesi de 'Alış düzenleme (eski)' + 'Satın alma'). Stok
miktarı doğru kalsa da ekstrede aynı satış iki-üç kez görünüyordu. Bu çiftler silinmez;
yalnızca ``superseded=True`` olarak işaretlenir ve arayüz varsayılan olarak gizler.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

_SALE_RE = re.compile(r"(?:Satış|İptal iade|Satış düzenleme|Satış iptali)\s+(\S+)")
_PURCHASE_RE = re.compile(r"\b((?:SA|AL)-[0-9][\w-]*?)(?::|\s|$)")


def _order_no(note: str | None) -> str | None:
    m = _SALE_RE.search(note or "")
    return m.group(1).strip() if m else None


def _purchase_no(note: str | None) -> str | None:
    m = _PURCHASE_RE.search(note or "")
    return m.group(1).strip().rstrip(":") if m else None


def mark_superseded(db: Session, movements: list[Any]) -> dict[int, str]:
    """{movement_id: neden} — 'duzenleme' (düzenleme çifti) veya 'iptal' (iptal edilmiş satış)."""
    from app.models.order import Order

    out: dict[int, str] = {}
    movs = sorted(movements, key=lambda m: m.id)
    order_nos = {n for m in movs if (m.reason or "") in ("sale", "sale_cancel") for n in [_order_no(m.note)] if n}
    status_by_no: dict[str, str] = {}
    if order_nos:
        for num, st in db.query(Order.order_number, Order.status).filter(Order.order_number.in_(order_nos)).all():
            status_by_no[num] = st or ""

    # Satış: her 'sale_cancel' kendinden önceki eşleşen 'sale' ile çift
    used: set[int] = set()
    for c in movs:
        if (c.reason or "") != "sale_cancel":
            continue
        no = _order_no(c.note)
        if not no:
            continue
        cands = [
            s
            for s in movs
            if s.id < c.id
            and s.id not in used
            and (s.reason or "") == "sale"
            and _order_no(s.note) == no
            and int(s.quantity or 0) == int(c.quantity or 0)
        ]
        if not cands:
            continue
        same_var = [s for s in cands if s.variant_id == c.variant_id]
        s = (same_var or cands)[0]
        used.update({s.id, c.id})
        kind = "iptal" if status_by_no.get(no) == "Sipariş İptali" else "duzenleme"
        out[s.id] = kind
        out[c.id] = kind

    # Alış düzenleme/iptal: 'purchase_edit' / 'purchase_cancel' önceki eşleşen 'Satın alma' ile çift
    for c in movs:
        if (c.reason or "") not in ("purchase_edit", "purchase_cancel"):
            continue
        no = _purchase_no(c.note)
        cands = [
            s
            for s in movs
            if s.id < c.id
            and s.id not in used
            and (s.reason or "") == "Satın alma"
            and _purchase_no(s.note) == no
            and int(s.quantity or 0) == int(c.quantity or 0)
            and s.variant_id == c.variant_id
        ]
        if not cands:
            continue
        s = cands[0]
        used.update({s.id, c.id})
        kind = "iptal" if (c.reason or "") == "purchase_cancel" else "duzenleme"
        out[s.id] = kind
        out[c.id] = kind
    return out
