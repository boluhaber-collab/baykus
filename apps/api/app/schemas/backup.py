from datetime import datetime

from pydantic import BaseModel


class BackupInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime
    path: str


class BackupCreateResult(BaseModel):
    filename: str
    size_bytes: int
    message: str
