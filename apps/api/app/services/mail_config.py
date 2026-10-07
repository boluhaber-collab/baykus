"""SMTP/IMAP credentials — local file under apps/api/data (not DB plaintext).

Priority: data/mail_config.env  >  process / root .env MAIL_* vars  >  defaults.
Passwords never returned to API clients (masked as ••••••••).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_API_DIR = Path(__file__).resolve().parents[2]  # apps/api
_CONFIG_PATH = _API_DIR / "data" / "mail_config.env"
_MASK = "••••••••"

_KEYS = (
    "MAIL_SMTP_HOST",
    "MAIL_SMTP_PORT",
    "MAIL_SMTP_USER",
    "MAIL_SMTP_PASSWORD",
    "MAIL_SMTP_USE_TLS",
    "MAIL_FROM_NAME",
    "MAIL_FROM_EMAIL",
    "MAIL_IMAP_HOST",
    "MAIL_IMAP_PORT",
    "MAIL_IMAP_USER",
    "MAIL_IMAP_PASSWORD",
    "MAIL_IMAP_USE_SSL",
    "MAIL_IMAP_FOLDER",
)


@dataclass
class MailConfig:
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

    @property
    def smtp_configured(self) -> bool:
        return bool(
            self.smtp_host.strip()
            and (self.from_email.strip() or self.smtp_user.strip())
            and self.smtp_password
        )

    @property
    def imap_configured(self) -> bool:
        return bool(
            self.imap_host.strip()
            and (self.imap_user.strip() or self.smtp_user.strip())
            and self.imap_password
        )

    def effective_from(self) -> str:
        addr = (self.from_email or self.smtp_user or "").strip()
        name = (self.from_name or "").strip()
        if name and addr:
            return f"{name} <{addr}>"
        return addr

    def imap_login_user(self) -> str:
        return (self.imap_user or self.smtp_user or "").strip()

    def imap_login_password(self) -> str:
        return self.imap_password or self.smtp_password or ""


def _parse_bool(v: str | None, default: bool = True) -> bool:
    if v is None or str(v).strip() == "":
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "evet", "on")


def _parse_int(v: str | None, default: int) -> int:
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _read_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, _, v = s.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            out[k] = v
    return out


def load_mail_config() -> MailConfig:
    file_vals = _read_dotenv(_CONFIG_PATH)
    # env overlay for keys not in file (or empty in file)
    def pick(key: str, default: str = "") -> str:
        fv = file_vals.get(key)
        if fv is not None and fv != "":
            return fv
        return os.environ.get(key, default) or default

    return MailConfig(
        smtp_host=pick("MAIL_SMTP_HOST"),
        smtp_port=_parse_int(pick("MAIL_SMTP_PORT", "587"), 587),
        smtp_user=pick("MAIL_SMTP_USER"),
        smtp_password=pick("MAIL_SMTP_PASSWORD"),
        smtp_use_tls=_parse_bool(pick("MAIL_SMTP_USE_TLS", "true"), True),
        from_name=pick("MAIL_FROM_NAME", "Baykuş Baskı"),
        from_email=pick("MAIL_FROM_EMAIL"),
        imap_host=pick("MAIL_IMAP_HOST"),
        imap_port=_parse_int(pick("MAIL_IMAP_PORT", "993"), 993),
        imap_user=pick("MAIL_IMAP_USER"),
        imap_password=pick("MAIL_IMAP_PASSWORD"),
        imap_use_ssl=_parse_bool(pick("MAIL_IMAP_USE_SSL", "true"), True),
        imap_folder=pick("MAIL_IMAP_FOLDER", "INBOX") or "INBOX",
    )


def save_mail_config(cfg: MailConfig, *, clear_smtp_password: bool = False, clear_imap_password: bool = False) -> MailConfig:
    """Write config to data/mail_config.env. Empty password fields keep previous."""
    prev = load_mail_config()
    smtp_pw = cfg.smtp_password
    imap_pw = cfg.imap_password
    if clear_smtp_password:
        smtp_pw = ""
    elif not smtp_pw or smtp_pw == _MASK:
        smtp_pw = prev.smtp_password
    if clear_imap_password:
        imap_pw = ""
    elif not imap_pw or imap_pw == _MASK:
        imap_pw = prev.imap_password

    merged = MailConfig(
        smtp_host=(cfg.smtp_host or "").strip(),
        smtp_port=int(cfg.smtp_port or 587),
        smtp_user=(cfg.smtp_user or "").strip(),
        smtp_password=smtp_pw,
        smtp_use_tls=bool(cfg.smtp_use_tls),
        from_name=(cfg.from_name or "").strip() or "Baykuş Baskı",
        from_email=(cfg.from_email or "").strip(),
        imap_host=(cfg.imap_host or "").strip(),
        imap_port=int(cfg.imap_port or 993),
        imap_user=(cfg.imap_user or "").strip(),
        imap_password=imap_pw,
        imap_use_ssl=bool(cfg.imap_use_ssl),
        imap_folder=(cfg.imap_folder or "INBOX").strip() or "INBOX",
    )

    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Baykuş E-Posta ayarları — şifreler yerel dosyada (veritabanında değil)",
        "# Bu dosya git'e eklenmez (apps/api/data/*).",
        f"MAIL_SMTP_HOST={merged.smtp_host}",
        f"MAIL_SMTP_PORT={merged.smtp_port}",
        f"MAIL_SMTP_USER={merged.smtp_user}",
        f"MAIL_SMTP_PASSWORD={merged.smtp_password}",
        f"MAIL_SMTP_USE_TLS={'true' if merged.smtp_use_tls else 'false'}",
        f"MAIL_FROM_NAME={merged.from_name}",
        f"MAIL_FROM_EMAIL={merged.from_email}",
        f"MAIL_IMAP_HOST={merged.imap_host}",
        f"MAIL_IMAP_PORT={merged.imap_port}",
        f"MAIL_IMAP_USER={merged.imap_user}",
        f"MAIL_IMAP_PASSWORD={merged.imap_password}",
        f"MAIL_IMAP_USE_SSL={'true' if merged.imap_use_ssl else 'false'}",
        f"MAIL_IMAP_FOLDER={merged.imap_folder}",
        "",
    ]
    _CONFIG_PATH.write_text("\n".join(lines), encoding="utf-8")
    try:
        os.chmod(_CONFIG_PATH, 0o600)
    except OSError:
        pass
    return merged


def public_settings_dict(cfg: MailConfig | None = None) -> dict:
    c = cfg or load_mail_config()
    return {
        "smtp_host": c.smtp_host,
        "smtp_port": c.smtp_port,
        "smtp_user": c.smtp_user,
        "smtp_password": _MASK if c.smtp_password else "",
        "smtp_use_tls": c.smtp_use_tls,
        "from_name": c.from_name,
        "from_email": c.from_email,
        "imap_host": c.imap_host,
        "imap_port": c.imap_port,
        "imap_user": c.imap_user,
        "imap_password": _MASK if c.imap_password else "",
        "imap_use_ssl": c.imap_use_ssl,
        "imap_folder": c.imap_folder,
        "smtp_configured": c.smtp_configured,
        "imap_configured": c.imap_configured,
        "config_path": str(_CONFIG_PATH),
    }


MASK = _MASK
CONFIG_PATH = _CONFIG_PATH
