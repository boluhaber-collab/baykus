"""SMTP send + IMAP sync — stdlib only (smtplib / imaplib / email)."""

from __future__ import annotations

import email
import imaplib
import smtplib
import ssl
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from typing import Any

from app.services.mail_config import MailConfig, load_mail_config


def _decode_header_value(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return raw


def _extract_body(msg: email.message.Message) -> tuple[str, str | None]:
    text_parts: list[str] = []
    html_parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp.lower():
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                payload = None
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain":
                text_parts.append(decoded)
            elif ctype == "text/html":
                html_parts.append(decoded)
    else:
        try:
            payload = msg.get_payload(decode=True)
        except Exception:
            payload = None
        if payload is not None:
            charset = msg.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if (msg.get_content_type() or "").lower() == "text/html":
                html_parts.append(decoded)
            else:
                text_parts.append(decoded)
    body_text = "\n".join(text_parts).strip()
    body_html = "\n".join(html_parts).strip() or None
    if not body_text and body_html:
        # crude strip for preview
        import re

        body_text = re.sub(r"<[^>]+>", " ", body_html)
        body_text = re.sub(r"\s+", " ", body_text).strip()[:4000]
    return body_text, body_html


def test_smtp(cfg: MailConfig | None = None) -> dict[str, Any]:
    c = cfg or load_mail_config()
    if not c.smtp_host.strip():
        return {"ok": False, "message": "SMTP sunucu adresi boş"}
    if not c.smtp_configured:
        return {"ok": False, "message": "SMTP kullanıcı / şifre eksik"}
    try:
        if c.smtp_use_tls:
            with smtplib.SMTP(c.smtp_host, c.smtp_port, timeout=20) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(c.smtp_user, c.smtp_password)
        else:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(c.smtp_host, c.smtp_port, timeout=20, context=context) as smtp:
                smtp.login(c.smtp_user, c.smtp_password)
        return {"ok": True, "message": f"SMTP bağlantısı başarılı ({c.smtp_host}:{c.smtp_port})"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"SMTP hata: {exc}"}


def test_imap(cfg: MailConfig | None = None) -> dict[str, Any]:
    c = cfg or load_mail_config()
    user = c.imap_login_user()
    password = c.imap_login_password()
    if not c.imap_host.strip():
        return {"ok": False, "message": "IMAP sunucu adresi boş"}
    if not user or not password:
        return {"ok": False, "message": "IMAP kullanıcı / şifre eksik"}
    try:
        if c.imap_use_ssl:
            imap = imaplib.IMAP4_SSL(c.imap_host, c.imap_port, timeout=20)
        else:
            imap = imaplib.IMAP4(c.imap_host, c.imap_port, timeout=20)
        try:
            imap.login(user, password)
            typ, _ = imap.select(c.imap_folder or "INBOX", readonly=True)
            if typ != "OK":
                return {"ok": False, "message": f"Klasör açılamadı: {c.imap_folder}"}
            return {
                "ok": True,
                "message": f"IMAP bağlantısı başarılı ({c.imap_host}:{c.imap_port} · {c.imap_folder})",
            }
        finally:
            try:
                imap.logout()
            except Exception:
                pass
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"IMAP hata: {exc}"}


def send_email(
    *,
    to: list[str] | str,
    subject: str,
    body_text: str,
    cc: list[str] | str | None = None,
    cfg: MailConfig | None = None,
) -> dict[str, Any]:
    c = cfg or load_mail_config()
    if not c.smtp_configured:
        return {"ok": False, "message": "SMTP ayarları eksik — Sistem › E-Posta Ayarları"}

    if isinstance(to, str):
        to_list = [x.strip() for x in to.replace(";", ",").split(",") if x.strip()]
    else:
        to_list = [x.strip() for x in to if x and str(x).strip()]
    if not to_list:
        return {"ok": False, "message": "Alıcı (To) boş"}

    if isinstance(cc, str):
        cc_list = [x.strip() for x in cc.replace(";", ",").split(",") if x.strip()]
    elif cc:
        cc_list = [x.strip() for x in cc if x and str(x).strip()]
    else:
        cc_list = []

    msg = EmailMessage()
    msg["Subject"] = subject or "(konu yok)"
    msg["From"] = c.effective_from()
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg.set_content(body_text or "")

    recipients = to_list + cc_list
    try:
        if c.smtp_use_tls:
            with smtplib.SMTP(c.smtp_host, c.smtp_port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(c.smtp_user, c.smtp_password)
                smtp.send_message(msg, to_addrs=recipients)
        else:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(c.smtp_host, c.smtp_port, timeout=30, context=context) as smtp:
                smtp.login(c.smtp_user, c.smtp_password)
                smtp.send_message(msg, to_addrs=recipients)
        mid = msg.get("Message-ID")
        return {
            "ok": True,
            "message": "E-posta gönderildi",
            "message_id": mid,
            "from_addr": c.effective_from(),
            "to_addrs": ", ".join(to_list),
            "cc_addrs": ", ".join(cc_list) if cc_list else None,
            "subject": subject or "(konu yok)",
            "body_text": body_text or "",
            "date_sent": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"Gönderim hatası: {exc}"}


def fetch_recent_imap(
    *,
    limit: int = 40,
    unseen_only: bool = False,
    cfg: MailConfig | None = None,
) -> dict[str, Any]:
    """Fetch recent messages from IMAP. Returns parsed list (not yet persisted)."""
    c = cfg or load_mail_config()
    user = c.imap_login_user()
    password = c.imap_login_password()
    if not c.imap_host.strip() or not user or not password:
        return {"ok": False, "message": "IMAP ayarları eksik", "messages": []}

    limit = max(1, min(int(limit or 40), 100))
    try:
        if c.imap_use_ssl:
            imap = imaplib.IMAP4_SSL(c.imap_host, c.imap_port, timeout=45)
        else:
            imap = imaplib.IMAP4(c.imap_host, c.imap_port, timeout=45)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"IMAP bağlanamadı: {exc}", "messages": []}

    parsed: list[dict[str, Any]] = []
    try:
        imap.login(user, password)
        typ, _ = imap.select(c.imap_folder or "INBOX", readonly=True)
        if typ != "OK":
            return {"ok": False, "message": f"Klasör açılamadı: {c.imap_folder}", "messages": []}

        criteria = "(UNSEEN)" if unseen_only else "ALL"
        typ, data = imap.search(None, criteria)
        if typ != "OK" or not data or not data[0]:
            return {"ok": True, "message": "Gelen kutusu boş", "messages": []}

        ids = data[0].split()
        # take last N (most recent typically last)
        ids = ids[-limit:]
        ids.reverse()  # newest first

        for num in ids:
            typ, msg_data = imap.fetch(num, "(RFC822 UID)")
            if typ != "OK" or not msg_data:
                continue
            raw = None
            uid = None
            for item in msg_data:
                if isinstance(item, tuple) and len(item) >= 2:
                    raw = item[1]
                    # try parse UID from response header bytes
                    meta = item[0]
                    if isinstance(meta, (bytes, bytearray)):
                        import re

                        m = re.search(rb"UID\s+(\d+)", meta)
                        if m:
                            uid = m.group(1).decode("ascii", errors="ignore")
            if not isinstance(raw, (bytes, bytearray)):
                continue
            msg = email.message_from_bytes(bytes(raw))
            body_text, body_html = _extract_body(msg)
            date_sent = None
            date_hdr = msg.get("Date")
            if date_hdr:
                try:
                    dt = parsedate_to_datetime(date_hdr)
                    if dt.tzinfo:
                        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                    date_sent = dt
                except Exception:
                    date_sent = None
            mid = (msg.get("Message-ID") or "").strip() or None
            parsed.append(
                {
                    "message_id": mid,
                    "imap_uid": uid or num.decode("ascii", errors="ignore"),
                    "from_addr": _decode_header_value(msg.get("From")),
                    "to_addrs": _decode_header_value(msg.get("To")),
                    "cc_addrs": _decode_header_value(msg.get("Cc")) or None,
                    "subject": _decode_header_value(msg.get("Subject")) or "(konu yok)",
                    "body_text": body_text[:50000],
                    "body_html": (body_html[:200000] if body_html else None),
                    "date_sent": date_sent,
                    "is_read": not unseen_only,
                }
            )
        return {
            "ok": True,
            "message": f"{len(parsed)} mesaj alındı",
            "messages": parsed,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"IMAP okuma hatası: {exc}", "messages": parsed}
    finally:
        try:
            imap.logout()
        except Exception:
            pass
