"""Yedekleme: SQLite/DB + uploads → zip under apps/api/backups/."""

from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.deps import require_roles
from app.models.user import User
from app.schemas.backup import BackupCreateResult, BackupInfo

router = APIRouter(prefix="/settings/backups", tags=["backups"])

API_ROOT = Path(__file__).resolve().parents[3]
BACKUPS_DIR = API_ROOT / "backups"
UPLOADS_DIR = API_ROOT / "uploads"


def _ensure_dir() -> Path:
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUPS_DIR


def _db_file_path() -> Path | None:
    url = get_settings().database_url
    if url.startswith("sqlite"):
        # sqlite:///./baykus.db or sqlite:////abs/path
        raw = url.split("sqlite:///", 1)[-1]
        p = Path(raw)
        if not p.is_absolute():
            p = (API_ROOT / p).resolve()
        return p if p.exists() else None
    return None


@router.get("", response_model=list[BackupInfo])
def list_backups(
    _: User = Depends(require_roles("admin")),
) -> list[BackupInfo]:
    d = _ensure_dir()
    items: list[BackupInfo] = []
    for f in sorted(d.glob("*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
        st = f.stat()
        items.append(
            BackupInfo(
                filename=f.name,
                size_bytes=st.st_size,
                created_at=datetime.fromtimestamp(st.st_mtime),
                path=str(f.relative_to(API_ROOT)),
            )
        )
    return items


@router.post("", response_model=BackupCreateResult)
def create_backup(
    _: User = Depends(require_roles("admin")),
) -> BackupCreateResult:
    d = _ensure_dir()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"baykus_backup_{stamp}.zip"
    dest = d / filename

    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # DB (sqlite file) or note for postgres
        db_path = _db_file_path()
        if db_path and db_path.is_file():
            zf.write(db_path, arcname=f"db/{db_path.name}")
        else:
            zf.writestr(
                "db/README.txt",
                "Postgres kullanılıyor: bu yedekte DB dosyası yok.\n"
                "Manuel: pg_dump baykus > baykus.sql\n",
            )
        # Uploads
        if UPLOADS_DIR.is_dir():
            for path in UPLOADS_DIR.rglob("*"):
                if path.is_file():
                    zf.write(path, arcname=f"uploads/{path.relative_to(UPLOADS_DIR).as_posix()}")
        zf.writestr(
            "RESTORE.txt",
            "Geri yükleme (manuel):\n"
            "1) Uygulamayı durdurun.\n"
            "2) Zip içindeki db/*.db dosyasını apps/api/ altına kopyalayın (SQLite).\n"
            "3) uploads/ içeriğini apps/api/uploads/ ile birleştirin.\n"
            "4) Postgres için: zip içindeki SQL/dump yoksa pg_restore / psql kullanın.\n"
            "5) Uygulamayı yeniden başlatın.\n",
        )

    size = dest.stat().st_size
    return BackupCreateResult(
        filename=filename,
        size_bytes=size,
        message=f"Yedek oluşturuldu: {filename} ({size} bayt). Geri yükleme manueldir.",
    )


@router.get("/{filename}")
def download_backup(
    filename: str,
    _: User = Depends(require_roles("admin")),
):
    safe = Path(filename).name
    if not safe.endswith(".zip") or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı")
    path = _ensure_dir() / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Yedek bulunamadı")
    return FileResponse(path, filename=safe, media_type="application/zip")


@router.delete("/{filename}", status_code=204)
def delete_backup(
    filename: str,
    _: User = Depends(require_roles("admin")),
) -> None:
    safe = Path(filename).name
    if not safe.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı")
    path = _ensure_dir() / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Yedek bulunamadı")
    path.unlink()
