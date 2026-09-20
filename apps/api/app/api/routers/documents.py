"""Evrak Dolabı — general document upload/list/download."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.document import Document
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentUpdate
from app.services import documents_store as store

router = APIRouter(prefix="/documents", tags=["documents"])

READ = ("admin", "satış", "üretim", "muhasebe")
WRITE = ("admin", "satış", "muhasebe")


@router.get("", response_model=list[DocumentOut])
def list_documents(
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    archive_tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
) -> list[DocumentOut]:
    query = db.query(Document)
    if category:
        query = query.filter(Document.category == category)
    if archive_tag:
        query = query.filter(Document.archive_tag == archive_tag)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            (Document.title.ilike(like))
            | (Document.original_filename.ilike(like))
            | (Document.notes.ilike(like))
        )
    rows = query.order_by(Document.id.desc()).limit(200).all()
    return [DocumentOut.model_validate(r) for r in rows]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str | None = Form(default=None),
    archive_tag: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE)),
) -> DocumentOut:
    original = store.safe_original_name(file.filename or "dosya")
    stored = store.make_stored_name(original)
    dest = store.absolute_path(stored)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if len(content) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya 30MB sınırını aşıyor")
    dest.write_bytes(content)
    row = Document(
        title=(title or original).strip()[:255],
        category=category,
        archive_tag=archive_tag,
        original_filename=original,
        stored_filename=stored,
        content_type=file.content_type,
        size_bytes=len(content),
        notes=notes,
        uploaded_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return DocumentOut.model_validate(row)


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(
    doc_id: int,
    payload: DocumentUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> DocumentOut:
    row = db.get(Document, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"]:
        data["title"] = data["title"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return DocumentOut.model_validate(row)


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
):
    row = db.get(Document, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    path = store.absolute_path(row.stored_filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dosya diskte yok")
    return FileResponse(
        path,
        media_type=row.content_type or "application/octet-stream",
        filename=row.original_filename,
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(Document, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    path = store.absolute_path(row.stored_filename)
    db.delete(row)
    db.commit()
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
