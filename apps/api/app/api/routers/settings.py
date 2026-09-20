from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.user import Role, User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> list[UserOut]:
    users = db.query(User).all()
    return [
        UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            roles=[r.name for r in u.roles],
        )
        for u in users
    ]


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    roles = db.query(Role).all()
    return {"roles": [{"id": r.id, "name": r.name, "description": r.description} for r in roles]}
