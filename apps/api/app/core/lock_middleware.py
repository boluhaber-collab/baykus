"""ASGI middleware: enforce app_settings.user_mode on /api routes."""

from __future__ import annotations

from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.lock_mode import blocked_detail, normalize_mode, path_allowed
from app.core.security import decode_access_token


def _read_user_mode() -> str:
    """Load lock mode from app_settings (source of truth)."""
    try:
        from app.db.session import SessionLocal
        from app.models.settings_model import AppSetting

        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter(AppSetting.key == "user_mode").first()
            return normalize_mode(row.value if row else None)
        finally:
            db.close()
    except Exception:
        return "Yönetici"


class LockModeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path or ""
        method = request.method or "GET"

        # Public / non-API — skip
        if path == "/health" or not path.startswith("/api"):
            return await call_next(request)
        if path.startswith("/api/auth"):
            return await call_next(request)

        # Only gate authenticated traffic; unauthenticated → route-level 401
        auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
        if not auth.lower().startswith("bearer "):
            return await call_next(request)

        token = auth.split(" ", 1)[1].strip()
        payload = decode_access_token(token)
        if not payload:
            return await call_next(request)

        mode = _read_user_mode()
        # JWT may carry lock_mode for clients; server still uses settings
        if not path_allowed(mode, path, method):
            body = {
                "detail": blocked_detail(mode, path),
                "lock_mode": mode,
                "path": path,
            }
            return JSONResponse(status_code=403, content=body)

        # Expose for downstream (optional)
        request.state.lock_mode = mode
        return await call_next(request)
