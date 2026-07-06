"""Recursive task tree, scoped per account. A task can parent an arbitrary
number of subtasks, which can each parent their own — the decomposition
never bottoms out at a fixed schema depth, matching the "nothing is static,
everything recursive" requirement. Every query is filtered by `account_id`.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import billing
from .db_models import Account, Task
from .schemas import TaskCreate, TaskUpdate


def create_task(db: Session, account: Account, payload: TaskCreate, default_week_id: int) -> Task:
    billing.enforce_limit(db, account, "open_tasks")
    task = Task(
        account_id=account.id,
        week_id=payload.week_id or default_week_id,
        parent_id=payload.parent_id,
        deliverable_id=payload.deliverable_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        estimate_minutes=payload.estimate_minutes,
        deadline=payload.deadline,
        tags=payload.tags,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, account_id: int, task_id: int) -> Task | None:
    return db.execute(
        select(Task).where(Task.id == task_id, Task.account_id == account_id)
    ).scalar_one_or_none()


def update_task(db: Session, account_id: int, task_id: int, payload: TaskUpdate) -> Task | None:
    task = get_task(db, account_id, task_id)
    if task is None:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


def list_tasks(db: Session, account_id: int, week_id: int, parent_id: int | None = None) -> list[Task]:
    stmt = select(Task).where(Task.account_id == account_id, Task.week_id == week_id)
    stmt = stmt.where(Task.parent_id.is_(None)) if parent_id is None else stmt.where(Task.parent_id == parent_id)
    stmt = stmt.order_by(Task.priority.asc(), Task.deadline.asc())
    return list(db.execute(stmt).scalars().all())


def get_tree(db: Session, account_id: int, task_id: int, _depth: int = 0) -> dict | None:
    """Recursively materialize a task and every descendant subtask."""
    task = get_task(db, account_id, task_id)
    if task is None:
        return None
    node = task_to_dict(task)
    if _depth > 50:  # guard against pathological cycles, not a design limit
        node["subtasks"] = []
        return node
    children = db.execute(
        select(Task.id).where(Task.account_id == account_id, Task.parent_id == task_id)
    ).scalars().all()
    node["subtasks"] = [get_tree(db, account_id, cid, _depth + 1) for cid in children]
    return node


def week_tree(db: Session, account_id: int, week_id: int) -> list[dict]:
    roots = list_tasks(db, account_id, week_id, parent_id=None)
    return [get_tree(db, account_id, r.id) for r in roots]


def list_all_tasks_in_week(db: Session, account_id: int, week_id: int) -> list[Task]:
    """Every task belonging to the week, at any depth of the recursive tree —
    used wherever a total must not silently exclude subtasks."""
    return list(db.execute(
        select(Task).where(Task.account_id == account_id, Task.week_id == week_id)
    ).scalars().all())


def task_to_dict(task: Task) -> dict:
    return {
        "id": task.id, "account_id": task.account_id, "week_id": task.week_id,
        "parent_id": task.parent_id, "deliverable_id": task.deliverable_id,
        "title": task.title, "description": task.description, "status": task.status,
        "priority": task.priority, "estimate_minutes": task.estimate_minutes,
        "deadline": task.deadline, "tags": task.tags,
        "carried_over_from": task.carried_over_from,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }
