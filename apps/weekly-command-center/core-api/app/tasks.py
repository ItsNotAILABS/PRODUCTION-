"""Recursive task tree. A task can parent an arbitrary number of subtasks,
which can each parent their own — the decomposition never bottoms out at a
fixed schema depth, matching the "nothing is static, everything recursive"
requirement.
"""
from __future__ import annotations

from . import db
from .models import TaskCreate, TaskUpdate


def create_task(payload: TaskCreate, default_week_id: int) -> dict:
    week_id = payload.week_id or default_week_id
    with db.tx() as c:
        cur = c.execute(
            """INSERT INTO tasks
               (week_id, parent_id, deliverable_id, title, description,
                priority, estimate_minutes, deadline, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                week_id, payload.parent_id, payload.deliverable_id, payload.title,
                payload.description, payload.priority, payload.estimate_minutes,
                payload.deadline, payload.tags,
            ),
        )
        task_id = cur.lastrowid
    return get_task(task_id)


def get_task(task_id: int) -> dict | None:
    row = db.get_conn().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return dict(row) if row else None


def update_task(task_id: int, payload: TaskUpdate) -> dict | None:
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return get_task(task_id)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [task_id]
    with db.tx() as c:
        c.execute(f"UPDATE tasks SET {set_clause}, updated_at = datetime('now') WHERE id = ?", values)
    return get_task(task_id)


def list_tasks(week_id: int, parent_id: int | None = None) -> list[dict]:
    conn = db.get_conn()
    if parent_id is None:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE week_id = ? AND parent_id IS NULL ORDER BY priority ASC, deadline ASC",
            (week_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE parent_id = ? ORDER BY priority ASC, deadline ASC",
            (parent_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_tree(task_id: int, _depth: int = 0) -> dict | None:
    """Recursively materialize a task and every descendant subtask."""
    task = get_task(task_id)
    if task is None:
        return None
    if _depth > 50:  # guard against pathological cycles, not a design limit
        task["subtasks"] = []
        return task
    children = db.get_conn().execute(
        "SELECT id FROM tasks WHERE parent_id = ?", (task_id,)
    ).fetchall()
    task["subtasks"] = [get_tree(c["id"], _depth + 1) for c in children]
    return task


def week_tree(week_id: int) -> list[dict]:
    roots = list_tasks(week_id, parent_id=None)
    return [get_tree(r["id"]) for r in roots]


def list_all_tasks_in_week(week_id: int) -> list[dict]:
    """Every task belonging to the week, at any depth of the recursive tree —
    used wherever a total must not silently exclude subtasks."""
    rows = db.get_conn().execute("SELECT * FROM tasks WHERE week_id = ?", (week_id,)).fetchall()
    return [dict(r) for r in rows]
