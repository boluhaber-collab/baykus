from fastapi import APIRouter, Depends

from app.core.deps import require_roles
from app.models.user import User

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.get("")
def list_quotes(_: User = Depends(require_roles("admin", "satış"))) -> dict:
    return {
        "items": [
            {"id": 1, "number": "TKL-2026-001", "customer": "Anadolu Tekstil", "amount": 12500, "status": "beklemede"},
            {"id": 2, "number": "TKL-2026-002", "customer": "Marmara AVM", "amount": 8400, "status": "gönderildi"},
        ],
        "message": "Teklifler stub",
    }
