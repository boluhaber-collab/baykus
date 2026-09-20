"""Fiyat listeleri CRUD + yazdır / CSV / PDF."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_roles
from app.models.price_list import PriceList, PriceListItem
from app.models.user import User
from app.schemas.price_list import (
    PriceListCreate,
    PriceListListItem,
    PriceListOut,
    PriceListUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/price-lists", tags=["price-lists"])


def _d(v) -> Decimal:
    return Decimal("0") if v is None else Decimal(str(v))


def _to_list(pl: PriceList) -> PriceListListItem:
    return PriceListListItem(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        currency=pl.currency or "TRY",
        is_active=bool(pl.is_active),
        valid_from=pl.valid_from,
        valid_to=pl.valid_to,
        item_count=len(pl.items or []),
        created_at=pl.created_at,
        updated_at=pl.updated_at,
    )


def _to_out(pl: PriceList) -> PriceListOut:
    return PriceListOut(**_to_list(pl).model_dump(), items=pl.items or [])


def _load(db: Session, list_id: int) -> PriceList:
    pl = (
        db.query(PriceList)
        .options(joinedload(PriceList.items))
        .filter(PriceList.id == list_id)
        .first()
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Fiyat listesi bulunamadı")
    return pl


def _replace_items(pl: PriceList, items: list) -> None:
    pl.items.clear()
    for item in items:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        blank = data.get("blank_price")
        unit = data.get("unit_price")
        # Baskısız yoksa unit_price kullan; unit_price yoksa baskısız
        if blank is None and unit is not None:
            blank = unit
        if unit is None or (blank is not None and _d(unit) == 0 and _d(blank) > 0):
            unit = blank if blank is not None else 0
        pl.items.append(
            PriceListItem(
                product_id=data.get("product_id"),
                variant_id=data.get("variant_id"),
                description=data["description"],
                unit_price=_d(unit),
                supplier_name=(data.get("supplier_name") or None),
                purchase_price=_d(data["purchase_price"]) if data.get("purchase_price") is not None else None,
                blank_price=_d(blank) if blank is not None else None,
                printed_price=_d(data["printed_price"]) if data.get("printed_price") is not None else None,
                embroidered_price=_d(data["embroidered_price"]) if data.get("embroidered_price") is not None else None,
                valid_from=data.get("valid_from"),
                valid_to=data.get("valid_to"),
                notes=data.get("notes"),
            )
        )


@router.get("", response_model=list[PriceListListItem])
def list_price_lists(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
    q: str | None = Query(default=None),
    active_only: bool = False,
) -> list[PriceListListItem]:
    query = db.query(PriceList).options(joinedload(PriceList.items))
    if active_only:
        query = query.filter(PriceList.is_active.is_(True))
    if q:
        like = f"%{q}%"
        query = query.filter((PriceList.name.ilike(like)) | (PriceList.description.ilike(like)))
    rows = query.order_by(PriceList.id.desc()).all()
    return [_to_list(r) for r in rows]


@router.post("", response_model=PriceListOut, status_code=status.HTTP_201_CREATED)
def create_price_list(
    payload: PriceListCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> PriceListOut:
    pl = PriceList(
        name=payload.name.strip(),
        description=payload.description,
        currency=payload.currency or "TRY",
        is_active=payload.is_active,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    db.add(pl)
    db.flush()
    _replace_items(pl, payload.items)
    db.commit()
    out = _to_out(_load(db, pl.id))
    write_audit(
        user_id=user.id,
        action="create",
        entity_type="price_list",
        entity_id=pl.id,
        detail={"name": pl.name},
    )
    return out


@router.get("/{list_id}", response_model=PriceListOut)
def get_price_list(
    list_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
) -> PriceListOut:
    return _to_out(_load(db, list_id))


@router.put("/{list_id}", response_model=PriceListOut)
def update_price_list(
    list_id: int,
    payload: PriceListUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "satış")),
) -> PriceListOut:
    pl = _load(db, list_id)
    data = payload.model_dump(exclude_unset=True)
    items = data.pop("items", None)
    for k, v in data.items():
        setattr(pl, k, v)
    if items is not None:
        class Wrap:
            def __init__(self, d: dict):
                self._d = d

            def model_dump(self):
                return self._d

        _replace_items(pl, [Wrap(x) for x in items])
    pl.updated_at = datetime.utcnow()
    db.commit()
    write_audit(
        user_id=user.id,
        action="update",
        entity_type="price_list",
        entity_id=pl.id,
        detail={"name": pl.name},
    )
    return _to_out(_load(db, pl.id))


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price_list(
    list_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> None:
    pl = _load(db, list_id)
    name = pl.name
    db.delete(pl)
    db.commit()
    write_audit(
        user_id=user.id,
        action="delete",
        entity_type="price_list",
        entity_id=list_id,
        detail={"name": name},
    )


def _item_rows(pl: PriceList) -> list[dict]:
    rows = []
    for it in pl.items or []:
        blank = it.blank_price if it.blank_price is not None else it.unit_price
        rows.append(
            {
                "description": it.description,
                "supplier_name": it.supplier_name or "",
                "purchase_price": float(it.purchase_price or 0),
                "blank_price": float(blank or 0),
                "printed_price": float(it.printed_price or 0),
                "embroidered_price": float(it.embroidered_price or 0),
                "unit_price": float(it.unit_price or 0),
                "notes": it.notes or "",
            }
        )
    return rows


@router.get("/{list_id}/export")
def export_price_list(
    list_id: int,
    fmt: str = Query(default="csv", pattern="^(csv|html|pdf)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "muhasebe")),
):
    """CSV / yazdırılabilir HTML / basit PDF."""
    pl = _load(db, list_id)
    rows = _item_rows(pl)
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            ["Ürün", "Tedarikçi", "Alış", "Baskısız", "Baskılı", "Nakışlı", "Not"]
        )
        for r in rows:
            w.writerow(
                [
                    r["description"],
                    r["supplier_name"],
                    r["purchase_price"],
                    r["blank_price"],
                    r["printed_price"],
                    r["embroidered_price"],
                    r["notes"],
                ]
            )
        data = "\ufeff" + buf.getvalue()
        return StreamingResponse(
            iter([data]),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="fiyat_listesi_{list_id}.csv"'
            },
        )
    if fmt == "html":
        trs = "".join(
            f"<tr><td>{r['description']}</td><td>{r['supplier_name']}</td>"
            f"<td style='text-align:right'>{r['purchase_price']:.2f}</td>"
            f"<td style='text-align:right'>{r['blank_price']:.2f}</td>"
            f"<td style='text-align:right'>{r['printed_price']:.2f}</td>"
            f"<td style='text-align:right'>{r['embroidered_price']:.2f}</td>"
            f"<td>{r['notes']}</td></tr>"
            for r in rows
        )
        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>{pl.name}</title>
<style>
body{{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#0f172a}}
h1{{font-size:20px;margin:0 0 4px}} .muted{{color:#64748b;font-size:12px;margin-bottom:16px}}
table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #cbd5e1;padding:6px 8px}} th{{background:#0f766e;color:#fff;text-align:left}}
@media print{{button{{display:none}}}}
</style></head><body>
<button onclick="window.print()">Yazdır</button>
<h1>{pl.name}</h1>
<div class="muted">Fiyat / Maliyet › Fiyat Listesi · {len(rows)} kalem</div>
<table><thead><tr>
<th>Ürün</th><th>Tedarikçi</th><th>Alış</th><th>Baskısız</th><th>Baskılı</th><th>Nakışlı</th><th>Not</th>
</tr></thead><tbody>{trs or '<tr><td colspan=7>Kalem yok</td></tr>'}</tbody></table>
</body></html>"""
        return HTMLResponse(html)
    # pdf
    from app.services.pdf import build_price_list_pdf

    pdf = build_price_list_pdf(pl.name, rows)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fiyat_listesi_{list_id}.pdf"'},
    )
