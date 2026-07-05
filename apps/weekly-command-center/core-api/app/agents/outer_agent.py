"""Outer agent — the one that talks to you, scoped to your account. Builds
the weekly digest: what's carried over, what's under pressure, what's coming
from your inbox context. Deliverable dates make it "attached" to deadlines
the way the request asked for, but inbox items are surfaced as information,
never auto-converted into tasks — the user decides what becomes a commitment.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import deliverables as deliverables_mod, tasks as tasks_mod, weeks as weeks_mod
from ..calendars import today_in_all_calendars
from ..db_models import InboxEvent, Week


def build_digest(db: Session, account_id: int, week_id: int | None = None) -> dict:
    week = weeks_mod.get_or_create_current_week(db, account_id) if week_id is None else _get_week(db, account_id, week_id)
    thread = weeks_mod.get_thread(db, account_id, week.id)
    week_tasks = tasks_mod.list_all_tasks_in_week(db, account_id, week.id)
    carried = [t for t in week_tasks if t.carried_over_from]
    done = [t for t in week_tasks if t.status == "done"]
    open_tasks = [t for t in week_tasks if t.status != "done"]

    open_deliverables = deliverables_mod.list_deliverables(db, account_id, status="open")
    under_pressure = sorted(
        [d for d in open_deliverables if float(d.pressure) >= 0.4],
        key=lambda d: -float(d.pressure),
    )

    inbox_context = _recent_inbox_context(db, account_id)
    calendar_today = today_in_all_calendars()

    lines = []
    lines.append(f"Week of {week.week_start} — week #{len(thread)} in your continuous thread.")
    if carried:
        lines.append(f"{len(carried)} item(s) carried over from last week — nothing was dropped.")
    if under_pressure:
        top = under_pressure[0]
        lines.append(f"Highest pressure: \"{top.title}\" (due {top.due_date}, pressure {float(top.pressure):.2f}).")
    lines.append(f"{len(open_tasks)} open task(s), {len(done)} done this week.")
    if inbox_context:
        lines.append(f"{len(inbox_context)} inbox item(s) with dates mentioned this week (context only).")

    return {
        "week": week_to_dict(week),
        "weeks_in_thread": len(thread),
        "carried_over_count": len(carried),
        "open_tasks": len(open_tasks),
        "done_tasks": len(done),
        "deliverables_under_pressure": [deliverable_to_dict(d) for d in under_pressure],
        "inbox_context": inbox_context,
        "today": vars(calendar_today),
        "narrative": " ".join(lines),
    }


def _get_week(db: Session, account_id: int, week_id: int) -> Week:
    return db.execute(select(Week).where(Week.id == week_id, Week.account_id == account_id)).scalar_one()


def week_to_dict(week: Week) -> dict:
    return {
        "id": week.id, "week_start": week.week_start, "week_end": week.week_end,
        "previous_week_id": week.previous_week_id, "narrative": week.narrative,
        "created_at": week.created_at.isoformat() if week.created_at else None,
    }


def deliverable_to_dict(d) -> dict:
    return {
        "id": d.id, "title": d.title, "project": d.project, "due_date": d.due_date,
        "status": d.status, "pressure": float(d.pressure),
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _recent_inbox_context(db: Session, account_id: int, limit: int = 10) -> list[dict]:
    rows = db.execute(
        select(InboxEvent).where(InboxEvent.account_id == account_id).order_by(InboxEvent.imported_at.desc()).limit(limit)
    ).scalars().all()
    return [
        {
            "id": r.id, "subject": r.subject, "mentioned_date": r.mentioned_date,
            "raw_snippet": r.raw_snippet, "linked_deliverable_id": r.linked_deliverable_id,
            "imported_at": r.imported_at.isoformat() if r.imported_at else None,
        }
        for r in rows
    ]
