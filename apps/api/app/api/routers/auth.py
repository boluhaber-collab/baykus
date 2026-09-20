from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_db
from app.core.lock_mode import normalize_mode
from app.core.security import create_access_token, verify_password
from app.models.settings_model import AppSetting
from app.models.user import User
from app.schemas.auth import Token, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _current_lock_mode(db: Session) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == "user_mode").first()
    return normalize_mode(row.value if row else None)


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-posta veya şifre hatalı")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap pasif")
    lock_mode = _current_lock_mode(db)
    token = create_access_token(
        user.email,
        {"roles": [r.name for r in user.roles], "lock_mode": lock_mode},
    )
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, db: Session = Depends(get_db)) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=[r.name for r in user.roles],
        lock_mode=_current_lock_mode(db),
    )
