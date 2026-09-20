"""Audit log listing — admin only."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    user_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    skip: int = 0,
    limit: int = Query(default=100, le=500),
) -> list[AuditLogOut]:
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if from_date:
        q = q.filter(AuditLog.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        q = q.filter(AuditLog.created_at <= datetime.combine(to_date, datetime.max.time()))
    rows = q.order_by(AuditLog.id.desc()).offset(skip).limit(limit).all()
    user_ids = {r.user_id for r in rows if r.user_id}
    users = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            users[u.id] = u
    out: list[AuditLogOut] = []
    for r in rows:
        u = users.get(r.user_id) if r.user_id else None
        out.append(
            AuditLogOut(
                id=r.id,
                user_id=r.user_id,
                user_email=u.email if u else None,
                user_name=u.full_name if u else None,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                detail=r.detail,
                created_at=r.created_at,
            )
        )
    return out
