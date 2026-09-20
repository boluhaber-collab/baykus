from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None = None
    user_email: str | None = None
    user_name: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    detail: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
