"""Ayarlar: kullanıcılar, roller, uygulama ayarları."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.security import hash_password
from app.models.settings_model import AppSetting
from app.models.user import Role, User
from app.schemas.auth import UserOut
from app.schemas.settings import (
    AppSettingsOut,
    AppSettingsUpdate,
    PasswordChange,
    UserCreate,
    UserUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SETTING_KEYS = ("company_name", "phone", "theme_label")


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_active=u.is_active,
        roles=[r.name for r in u.roles],
    )


def _settings_map(db: Session) -> dict[str, str]:
    return {s.key: s.value for s in db.query(AppSetting).all()}


def _upsert_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> list[UserOut]:
    return [_user_out(u) for u in db.query(User).order_by(User.id).all()]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> UserOut:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="E-posta zaten kayıtlı")
    roles = db.query(Role).filter(Role.name.in_(payload.roles or [])).all()
    if payload.roles and len(roles) != len(set(payload.roles)):
        raise HTTPException(status_code=400, detail="Geçersiz rol")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_active=payload.is_active,
    )
    user.roles = list(roles)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    roles = data.pop("roles", None)
    for k, v in data.items():
        setattr(user, k, v)
    if roles is not None:
        role_rows = db.query(Role).filter(Role.name.in_(roles)).all()
        if len(role_rows) != len(set(roles)):
            raise HTTPException(status_code=400, detail="Geçersiz rol")
        user.roles = list(role_rows)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    user_id: int,
    payload: PasswordChange,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    roles = db.query(Role).order_by(Role.id).all()
    return {"roles": [{"id": r.id, "name": r.name, "description": r.description} for r in roles]}


@router.get("/app", response_model=AppSettingsOut)
def get_app_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "satış", "üretim", "muhasebe")),
) -> AppSettingsOut:
    m = _settings_map(db)
    return AppSettingsOut(
        company_name=m.get("company_name", "Baykuş Baskı"),
        phone=m.get("phone", ""),
        theme_label=m.get("theme_label", "Varsayılan"),
    )


@router.put("/app", response_model=AppSettingsOut)
def update_app_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> AppSettingsOut:
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key in SETTING_KEYS and value is not None:
            _upsert_setting(db, key, value)
    db.commit()
    m = _settings_map(db)
    return AppSettingsOut(
        company_name=m.get("company_name", "Baykuş Baskı"),
        phone=m.get("phone", ""),
        theme_label=m.get("theme_label", "Varsayılan"),
    )
