"""Görev / Hatırlatma CRUD."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models.task import TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])

READ = ("admin", "satış", "üretim", "muhasebe")
WRITE = ("admin", "satış", "üretim")


@router.get("/meta")
def task_meta(_: User = Depends(require_roles(*READ))) -> dict:
    return {
        "types": list(TASK_TYPES),
        "priorities": list(TASK_PRIORITIES),
        "statuses": list(TASK_STATUSES),
    }


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ)),
    q: str | None = Query(default=None),
    filter: str = Query(default="open", pattern="^(open|today|all|done)$"),
) -> list[Task]:
    rows = db.query(Task).order_by(Task.due_date.asc(), Task.id.desc())
    today = date.today()
    if filter == "open":
        rows = rows.filter(Task.status != "Tamamlandı")
    elif filter == "today":
        rows = rows.filter(Task.status != "Tamamlandı", Task.due_date == today)
    elif filter == "done":
        rows = rows.filter(Task.status == "Tamamlandı")
    items = rows.limit(500).all()
    if q and q.strip():
        needle = q.strip().casefold()
        items = [
            t
            for t in items
            if needle
            in " ".join(
                [
                    t.title or "",
                    t.customer_name or "",
                    t.phone or "",
                    t.order_number or "",
                    t.note or "",
                    t.task_type or "",
                ]
            ).casefold()
        ]
    return items


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> Task:
    row = Task(
        due_date=payload.due_date,
        due_time=(payload.due_time or "").strip() or None,
        task_type=payload.task_type or "Diğer",
        title=payload.title.strip(),
        customer_name=(payload.customer_name or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        order_number=(payload.order_number or "").strip() or None,
        priority=payload.priority or "Normal",
        note=(payload.note or "").strip() or None,
        status="Açık",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> Task:
    row = db.get(Task, task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "status" in data and data["status"]:
        if data["status"] == "Tamamlandı" and row.status != "Tamamlandı":
            row.completed_at = datetime.utcnow()
        elif data["status"] != "Tamamlandı":
            row.completed_at = None
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE)),
) -> None:
    row = db.get(Task, task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")
    db.delete(row)
    db.commit()
