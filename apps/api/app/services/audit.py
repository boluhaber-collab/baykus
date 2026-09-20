"""Best-effort audit logging — never raises; uses its own short-lived session."""

from __future__ import annotations

import json
from typing import Any


def write_audit(
    *,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    detail: Any = None,
) -> None:
    try:
        from app.db.session import SessionLocal
        from app.models.audit import AuditLog

        if detail is not None and not isinstance(detail, str):
            try:
                detail = json.dumps(detail, ensure_ascii=False, default=str)
            except Exception:
                detail = str(detail)
        eid = None if entity_id is None else str(entity_id)
        db = SessionLocal()
        try:
            db.add(
                AuditLog(
                    user_id=user_id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=eid,
                    detail=detail,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        pass
