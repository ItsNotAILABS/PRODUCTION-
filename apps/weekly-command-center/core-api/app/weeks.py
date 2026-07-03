"""Weekly continuity: the thread that must never drop.

Every week row points at `previous_week_id`, so the whole run of weeks a
professional has ever tracked is one recursively-walkable chain. Rollover
copies forward anything not marked done, tagged with `carried_over_from` so
the UI can show "this has been alive for N weeks" instead of silently
re-creating it.
"""
from __future__ import annotations

from datetime import date

from . import db
from .calendars import week_bounds


def get_or_create_current_week(anchor: date | None = None) -> dict:
    start, end = week_bounds(anchor)
    conn = db.get_conn()
    row = conn.execute(
        "SELECT * FROM weeks WHERE week_start = ?", (start.isoformat(),)
    ).fetchone()
    if row:
        return dict(row)

    prev = conn.execute(
        "SELECT * FROM weeks ORDER BY week_start DESC LIMIT 1"
    ).fetchone()

    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO weeks (week_start, week_end, previous_week_id) VALUES (?, ?, ?)",
            (start.isoformat(), end.isoformat(), prev["id"] if prev else None),
        )
        new_week_id = cur.lastrowid

    if prev:
        _carry_over_open_tasks(prev["id"], new_week_id)

    return dict(conn.execute("SELECT * FROM weeks WHERE id = ?", (new_week_id,)).fetchone())


def _carry_over_open_tasks(prev_week_id: int, new_week_id: int) -> int:
    conn = db.get_conn()
    open_tasks = conn.execute(
        "SELECT * FROM tasks WHERE week_id = ? AND status != 'done' AND parent_id IS NULL",
        (prev_week_id,),
    ).fetchall()
    carried = 0
    with db.tx() as c:
        for t in open_tasks:
            c.execute(
                """INSERT INTO tasks
                   (week_id, parent_id, deliverable_id, title, description,
                    status, priority, estimate_minutes, deadline, tags, carried_over_from)
                   VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_week_id, t["deliverable_id"], t["title"], t["description"],
                    t["status"], t["priority"], t["estimate_minutes"], t["deadline"],
                    t["tags"], t["carried_over_from"] or t["id"],
                ),
            )
            carried += 1
    return carried


def get_thread(week_id: int, depth: int = 12) -> list[dict]:
    """Walk the recursive previous_week_id chain backward up to `depth` weeks."""
    conn = db.get_conn()
    chain = []
    current_id = week_id
    for _ in range(depth):
        row = conn.execute("SELECT * FROM weeks WHERE id = ?", (current_id,)).fetchone()
        if not row:
            break
        chain.append(dict(row))
        if row["previous_week_id"] is None:
            break
        current_id = row["previous_week_id"]
    return chain


def set_narrative(week_id: int, narrative: str) -> None:
    with db.tx() as c:
        c.execute("UPDATE weeks SET narrative = ? WHERE id = ?", (narrative, week_id))
