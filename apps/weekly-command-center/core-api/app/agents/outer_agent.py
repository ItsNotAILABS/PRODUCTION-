"""Outer agent — the one that talks to you. Builds the weekly digest: what's
carried over, what's under pressure, what's coming from your inbox context.
Deliverable dates make it "attached" to deadlines the way the request asked
for, but inbox items are surfaced as information, never auto-converted into
tasks — the user decides what becomes a commitment.
"""
from __future__ import annotations

from . import inner_agent  # noqa: F401  (re-exported for callers that want both agents from one place)
from .. import db, deliverables as deliverables_mod, tasks as tasks_mod, weeks as weeks_mod
from ..calendars import today_in_all_calendars


def build_digest(week_id: int | None = None) -> dict:
    week = weeks_mod.get_or_create_current_week() if week_id is None else _get_week(week_id)
    thread = weeks_mod.get_thread(week["id"])
    week_tasks = tasks_mod.list_all_tasks_in_week(week["id"])
    carried = [t for t in week_tasks if t["carried_over_from"]]
    done = [t for t in week_tasks if t["status"] == "done"]
    open_tasks = [t for t in week_tasks if t["status"] != "done"]

    open_deliverables = deliverables_mod.list_deliverables(status="open")
    under_pressure = sorted(
        [d for d in open_deliverables if d["pressure"] >= 0.4],
        key=lambda d: -d["pressure"],
    )

    inbox_context = _recent_inbox_context()
    calendar_today = today_in_all_calendars()

    lines = []
    lines.append(f"Week of {week['week_start']} — week #{len(thread)} in your continuous thread.")
    if carried:
        lines.append(f"{len(carried)} item(s) carried over from last week — nothing was dropped.")
    if under_pressure:
        top = under_pressure[0]
        lines.append(
            f"Highest pressure: \"{top['title']}\" (due {top['due_date']}, "
            f"pressure {top['pressure']:.2f})."
        )
    lines.append(f"{len(open_tasks)} open task(s), {len(done)} done this week.")
    if inbox_context:
        lines.append(f"{len(inbox_context)} inbox item(s) with dates mentioned this week (context only).")

    return {
        "week": week,
        "weeks_in_thread": len(thread),
        "carried_over_count": len(carried),
        "open_tasks": len(open_tasks),
        "done_tasks": len(done),
        "deliverables_under_pressure": under_pressure,
        "inbox_context": inbox_context,
        "today": vars(calendar_today),
        "narrative": " ".join(lines),
    }


def _get_week(week_id: int) -> dict:
    row = db.get_conn().execute("SELECT * FROM weeks WHERE id = ?", (week_id,)).fetchone()
    return dict(row)


def _recent_inbox_context(limit: int = 10) -> list[dict]:
    rows = db.get_conn().execute(
        "SELECT * FROM inbox_events ORDER BY imported_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]
