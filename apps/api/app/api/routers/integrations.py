"""Entegrasyon ayarları — BizimHesap iskeleti."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.integrations.bizimhesap import client_from_settings
from app.models.settings_model import AppSetting
from app.models.user import User
from app.schemas.integrations import (
    BizimHesapSettings,
    BizimHesapSettingsUpdate,
    IntegrationActionResult,
)

router = APIRouter(prefix="/settings/integrations", tags=["integrations"])

KEY_API = "bizimhesap_api_key"
KEY_SECRET = "bizimhesap_api_secret"


def _get(db: Session, key: str) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else ""


def _upsert(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def _client(db: Session):
    return client_from_settings(_get(db, KEY_API), _get(db, KEY_SECRET))


@router.get("/bizimhesap", response_model=BizimHesapSettings)
def get_bizimhesap(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> BizimHesapSettings:
    key = _get(db, KEY_API)
    secret = _get(db, KEY_SECRET)
    return BizimHesapSettings(
        api_key=key,
        api_secret="••••••••" if secret else "",
        configured=bool(key.strip() and secret.strip()),
    )


@router.put("/bizimhesap", response_model=BizimHesapSettings)
def update_bizimhesap(
    payload: BizimHesapSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> BizimHesapSettings:
    data = payload.model_dump(exclude_unset=True)
    if "api_key" in data and data["api_key"] is not None:
        _upsert(db, KEY_API, data["api_key"].strip())
    if "api_secret" in data and data["api_secret"] is not None:
        # Ignore masked placeholder on save
        if data["api_secret"] and data["api_secret"] != "••••••••":
            _upsert(db, KEY_SECRET, data["api_secret"].strip())
        elif data["api_secret"] == "":
            _upsert(db, KEY_SECRET, "")
    db.commit()
    key = _get(db, KEY_API)
    secret = _get(db, KEY_SECRET)
    return BizimHesapSettings(
        api_key=key,
        api_secret="••••••••" if secret else "",
        configured=bool(key.strip() and secret.strip()),
    )


@router.post("/bizimhesap/test", response_model=IntegrationActionResult)
def test_bizimhesap(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> IntegrationActionResult:
    r = _client(db).test_connection()
    return IntegrationActionResult(**r)


@router.post("/bizimhesap/sync-customers", response_model=IntegrationActionResult)
def sync_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> IntegrationActionResult:
    r = _client(db).sync_customers()
    return IntegrationActionResult(**r)


@router.post("/bizimhesap/sync-products", response_model=IntegrationActionResult)
def sync_products(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> IntegrationActionResult:
    r = _client(db).sync_products()
    return IntegrationActionResult(**r)
