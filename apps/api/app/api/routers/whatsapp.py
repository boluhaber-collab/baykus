from fastapi import APIRouter, Depends

from app.core.deps import require_roles
from app.models.user import User

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/templates")
def list_templates(_: User = Depends(require_roles("admin", "satış"))) -> dict:
    return {
        "templates": [
            {"id": 1, "name": "siparis_onay", "body": "Merhaba {{ad}}, siparişiniz (#{{no}}) onaylandı."},
            {"id": 2, "name": "teslim_bildirim", "body": "Siparişiniz hazır! Teslim için sizi bekliyoruz."},
            {"id": 3, "name": "odeme_hatirlatma", "body": "{{firma}} için {{tutar}} TL bakiyeniz bulunmaktadır."},
        ],
        "message": "WhatsApp şablonları stub",
    }
