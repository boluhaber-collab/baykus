"""E-posta API şemaları."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MailSettingsOut(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    from_name: str = "Baykuş Baskı"
    from_email: str = ""
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_use_ssl: bool = True
    imap_folder: str = "INBOX"
    smtp_configured: bool = False
    imap_configured: bool = False
    config_path: str = ""


class MailSettingsUpdate(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool | None = None
    from_name: str | None = None
    from_email: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    imap_user: str | None = None
    imap_password: str | None = None
    imap_use_ssl: bool | None = None
    imap_folder: str | None = None
    clear_smtp_password: bool = False
    clear_imap_password: bool = False


class MailActionResult(BaseModel):
    ok: bool
    message: str
    imported: int | None = None
    linked: int | None = None


class MailSendRequest(BaseModel):
    to: str = Field(..., min_length=1)
    subject: str = ""
    body: str = ""
    cc: str | None = None
    customer_id: int | None = None
    supplier_id: int | None = None


class MailMessageOut(BaseModel):
    id: int
    folder: str
    direction: str
    message_id: str | None = None
    from_addr: str
    to_addrs: str
    cc_addrs: str | None = None
    subject: str
    body_text: str
    body_html: str | None = None
    date_sent: datetime | None = None
    is_read: bool
    customer_id: int | None = None
    supplier_id: int | None = None
    customer_name: str | None = None
    error: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MailMessageUpdate(BaseModel):
    is_read: bool | None = None
    customer_id: int | None = None
