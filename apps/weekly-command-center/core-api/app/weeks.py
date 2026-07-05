"""Weekly continuity: the thread that must never drop, scoped per account.

Every week row points at `previous_week_id`, so the whole run of weeks a
tenant has ever tracked is one recursively-walkable chain. Rollover copies
forward anything not marked done, tagged with `carried_over_from` so the UI
can show "this has been alive for N weeks" instead of silently re-creating
it. All queries are filtered by `account_id` — no cross-tenant leakage.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .calendars import week_bounds
from .db_models import Task, Week


def get_or_create_current_week(db: Session, account_id: int, anchor: date | None = None) -> Week:
    start, end = week_bounds(anchor)
    existing = db.execute(
        select(Week).where(Week.account_id == account_id, Week.week_start == start.isoformat())
    ).scalar_one_or_none()
    if existing:
        return existing

    prev = db.execute(
        select(Week).where(Week.account_id == account_id).order_by(Week.week_start.desc())
    ).scalars().first()

    new_week = Week(
        account_id=account_id,
        week_start=start.isoformat(),
        week_end=end.isoformat(),
        previous_week_id=prev.id if prev else None,
    )
    db.add(new_week)
    db.flush()

    if prev:
        _carry_over_open_tasks(db, account_id, prev.id, new_week.id)

    db.commit()
    db.refresh(new_week)
    return new_week


def _carry_over_open_tasks(db: Session, account_id: int, prev_week_id: int, new_week_id: int) -> int:
    open_tasks = db.execute(
        select(Task).where(
            Task.account_id == account_id,
            Task.week_id == prev_week_id,
            Task.status != "done",
            Task.parent_id.is_(None),
        )
    ).scalars().all()
    carried = 0
    for t in open_tasks:
        db.add(Task(
            account_id=account_id,
            week_id=new_week_id,
            parent_id=None,
            deliverable_id=t.deliverable_id,
            title=t.title,
            description=t.description,
            status=t.status,
            priority=t.priority,
            estimate_minutes=t.estimate_minutes,
            deadline=t.deadline,
            tags=t.tags,
            carried_over_from=t.carried_over_from or t.id,
        ))
        carried += 1
    return carried


def get_thread(db: Session, account_id: int, week_id: int, depth: int = 12) -> list[Week]:
    """Walk the recursive previous_week_id chain backward up to `depth` weeks."""
    chain = []
    current_id = week_id
    for _ in range(depth):
        row = db.execute(
            select(Week).where(Week.id == current_id, Week.account_id == account_id)
        ).scalar_one_or_none()
        if not row:
            break
        chain.append(row)
        if row.previous_week_id is None:
            break
        current_id = row.previous_week_id
    return chain


def set_narrative(db: Session, account_id: int, week_id: int, narrative: str) -> None:
    week = db.execute(select(Week).where(Week.id == week_id, Week.account_id == account_id)).scalar_one_or_none()
    if week:
        week.narrative = narrative
        db.commit()
