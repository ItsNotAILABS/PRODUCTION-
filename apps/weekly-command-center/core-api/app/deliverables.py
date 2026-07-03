"""Deliverables carry the real deadline pressure of the week. `pressure` is
recomputed by the inner agent (see agents/inner_agent.py) so the outer-facing
digest can say *why* something feels urgent, not just that it's due.
"""
from __future__ import annotations

from datetime import date, datetime

from . import db
from .models import DeliverableCreate


def create_deliverable(payload: DeliverableCreate) -> dict:
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO deliverables (title, project, due_date) VALUES (?, ?, ?)",
            (payload.title, payload.project, payload.due_date),
        )
        deliverable_id = cur.lastrowid
    return get_deliverable(deliverable_id)


def get_deliverable(deliverable_id: int) -> dict | None:
    row = db.get_conn().execute(
        "SELECT * FROM deliverables WHERE id = ?", (deliverable_id,)
    ).fetchone()
    return dict(row) if row else None


def list_deliverables(status: str | None = None) -> list[dict]:
    conn = db.get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM deliverables WHERE status = ? ORDER BY due_date ASC", (status,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM deliverables ORDER BY due_date ASC").fetchall()
    return [dict(r) for r in rows]


def recompute_pressure() -> int:
    """Pressure rises non-linearly as a due date approaches; overdue items
    pin at 1.0. Called by the inner agent on its housekeeping cadence."""
    conn = db.get_conn()
    updated = 0
    today = date.today()
    with db.tx() as c:
        for row in conn.execute("SELECT * FROM deliverables WHERE status != 'done'").fetchall():
            if not row["due_date"]:
                continue
            try:
                due = datetime.fromisoformat(row["due_date"]).date()
            except ValueError:
                continue
            days_left = (due - today).days
            if days_left <= 0:
                pressure = 1.0
            elif days_left >= 21:
                pressure = 0.05
            else:
                pressure = round(max(0.05, 1.0 - (days_left / 21) ** 1.5), 3)
            c.execute(
                "UPDATE deliverables SET pressure = ?, updated_at = datetime('now') WHERE id = ?",
                (pressure, row["id"]),
            )
            updated += 1
    return updated
