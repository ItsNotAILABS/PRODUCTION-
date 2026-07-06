"""Deliverables carry the real deadline pressure of the week, scoped per
account. `pressure` is recomputed by the inner agent (see
agents/inner_agent.py) so the outer-facing digest can say *why* something
feels urgent, not just that it's due.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import billing
from .db_models import Account, Deliverable
from .schemas import DeliverableCreate


def create_deliverable(db: Session, account: Account, payload: DeliverableCreate) -> Deliverable:
    billing.enforce_limit(db, account, "deliverables")
    deliverable = Deliverable(account_id=account.id, title=payload.title, project=payload.project, due_date=payload.due_date)
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)
    return deliverable


def get_deliverable(db: Session, account_id: int, deliverable_id: int) -> Deliverable | None:
    return db.execute(
        select(Deliverable).where(Deliverable.id == deliverable_id, Deliverable.account_id == account_id)
    ).scalar_one_or_none()


def list_deliverables(db: Session, account_id: int, status: str | None = None) -> list[Deliverable]:
    stmt = select(Deliverable).where(Deliverable.account_id == account_id)
    if status:
        stmt = stmt.where(Deliverable.status == status)
    stmt = stmt.order_by(Deliverable.due_date.asc())
    return list(db.execute(stmt).scalars().all())


def recompute_pressure(db: Session, account_id: int | None = None) -> int:
    """Pressure rises non-linearly as a due date approaches; overdue items
    pin at 1.0. Called by the inner agent on its housekeeping cadence, either
    for one account or (account_id=None) across every tenant."""
    stmt = select(Deliverable).where(Deliverable.status != "done")
    if account_id is not None:
        stmt = stmt.where(Deliverable.account_id == account_id)
    today = date.today()
    updated = 0
    for row in db.execute(stmt).scalars().all():
        if not row.due_date:
            continue
        try:
            due = datetime.fromisoformat(row.due_date).date()
        except ValueError:
            continue
        days_left = (due - today).days
        if days_left <= 0:
            pressure = 1.0
        elif days_left >= 21:
            pressure = 0.05
        else:
            pressure = round(max(0.05, 1.0 - (days_left / 21) ** 1.5), 3)
        row.pressure = pressure
        updated += 1
    db.commit()
    return updated
