from datetime import datetime

from pydantic import BaseModel


class OrderDesignFileOut(BaseModel):
    id: int
    order_id: int
    original_filename: str
    stored_filename: str
    content_type: str | None = None
    size_bytes: int
    uploaded_by_user_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
