"""Fihrist — unified contacts directory."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.contact import DirectoryContact
from app.models.customer import CariMovement, Customer
from app.models.supplier import Supplier, SupplierMovement
from app.models.user import User
from app.schemas.contact import (
    DirectoryContactCreate,
    DirectoryContactOut,
    DirectoryContactUpdate,
    DirectoryEntry,
)

router = APIRouter(prefix="/directory", tags=["directory"])

READ = ("admin", "satış", "üretim", "muhasebe")
WRITE = ("admin", "satış")


def _customer_balances(db: Session, ids: list[int]) -> dict[int, Decimal]:
    if not ids:
        return {}
    rows = (
        db.query(
            CariMovement.customer_id,
            func.coalesce(func.sum(CariMovement.debit), 0),
            func.coalesce(func.sum(CariMovement.credit), 0),
        )
        .filter(CariMovement.customer_id.in_(ids))
        .group_by(CariMovement.customer_id)
        .all()
    )
    return {cid: Decimal(str(d)) - Decimal(str(c)) for cid, d, c in rows}


def _supplier_balances(db: Session, ids: list[int]) -> dict[int, Decimal]:
    if not ids:
        return {}
    rows = (
        db.query(
            SupplierMovement.supplier_id,
            func.coalesce(func.sum(SupplierMovement.debit), 0),
            func.coalesce(func.sum(SupplierMovement.credit), 0),
        )
        .filter(SupplierMovement.supplier_id.in_(ids))
        .group_by(SupplierMovement.supplier_id)
        .all()
    )
    return {sid: Decimal(str(d)) - Decimal(str(c)) for sid, d, c in rows}


@router.get("", response_model=list[DirectoryEntry])
def list_directory(
    q: str | None = Query(default=None),
    kind: str | None = Query(default=None, description="customer|supplier|contact"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[DirectoryEntry]:
    like = f"%{q.strip()}%" if q and q.strip() else None
    entries: list[DirectoryEntry] = []

    if kind in (None, "customer", ""):
        cq = db.query(Customer).filter(Customer.is_active.is_(True))
        if like:
            cq = cq.filter(
                (Customer.name.ilike(like))
                | (Customer.company.ilike(like))
                | (Customer.phone.ilike(like))
                | (Customer.email.ilike(like))
                | (Customer.code.ilike(like))
            )
        customers = cq.order_by(Customer.name).limit(200).all()
        bal = _customer_balances(db, [c.id for c in customers])
        for c in customers:
            opening = c.opening_balance or Decimal("0")
            balance = float(opening + bal.get(c.id, Decimal("0")))
            entries.append(
                DirectoryEntry(
                    kind="customer",
                    id=c.id,
                    name=c.name,
                    company=c.company,
                    phone=c.phone,
                    email=c.email,
                    city=c.city,
                    code=c.code,
                    href=f"/customers/{c.id}",
                    balance=balance,
                )
            )

    if kind in (None, "supplier", ""):
        sq = db.query(Supplier).filter(Supplier.is_active.is_(True))
        if like:
            sq = sq.filter(
                (Supplier.name.ilike(like))
                | (Supplier.phone.ilike(like))
                | (Supplier.code.ilike(like))
            )
        suppliers = sq.order_by(Supplier.name).limit(200).all()
        sbal = _supplier_balances(db, [s.id for s in suppliers])
        for s in suppliers:
            opening = s.opening_balance or Decimal("0")
            balance = float(opening + sbal.get(s.id, Decimal("0")))
            entries.append(
                DirectoryEntry(
                    kind="supplier",
                    id=s.id,
                    name=s.name,
                    company=None,
                    phone=s.phone,
                    email=getattr(s, "email", None),
                    city=s.city,
                    code=s.code,
                    href=f"/suppliers/{s.id}",
                    balance=balance,
                )
            )

    if kind in (None, "contact", ""):
        tq = db.query(DirectoryContact)
        if like:
            tq = tq.filter(
                (DirectoryContact.name.ilike(like))
                | (DirectoryContact.company.ilike(like))
                | (DirectoryContact.phone.ilike(like))
                | (DirectoryContact.email.ilike(like))
            )
        for t in tq.order_by(DirectoryContact.name).limit(200).all():
            entries.append(
                DirectoryEntry(
                    kind="contact",
                    id=t.id,
                    name=t.name,
                    company=t.company,
                    phone=t.phone,
                    email=t.email,
                    city=t.city,
                    code=None,
                    href=f"/directory?contact={t.id}",
                    balance=None,
                )
            )

    entries.sort(key=lambda e: (e.name or "").lower())
    return entries


@router.get("/contacts", response_model=list[DirectoryContactOut])
def list_contacts(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[DirectoryContactOut]:
    rows = db.query(DirectoryContact).order_by(DirectoryContact.name).all()
    return [DirectoryContactOut.model_validate(r) for r in rows]


@router.post("/contacts", response_model=DirectoryContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: DirectoryContactCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DirectoryContactOut:
    row = DirectoryContact(**payload.model_dump())
    row.name = row.name.strip()
    db.add(row)
    db.commit()
    db.refresh(row)
    return DirectoryContactOut.model_validate(row)


@router.put("/contacts/{contact_id}", response_model=DirectoryContactOut)
def update_contact(
    contact_id: int,
    payload: DirectoryContactUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DirectoryContactOut:
    row = db.get(DirectoryContact, contact_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kişi bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return DirectoryContactOut.model_validate(row)


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(DirectoryContact, contact_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kişi bulunamadı")
    db.delete(row)
    db.commit()
