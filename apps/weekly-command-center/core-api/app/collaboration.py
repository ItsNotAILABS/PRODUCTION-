"""Team collaboration: task comments with @mentions, and an account-wide
activity feed. Scoped per account like every other business-logic module —
mentions can only resolve to teammates in the same account, never across
tenants.
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import ActivityEvent, Comment, Task, User

_MENTION_RE = re.compile(r"@([\w.+-]+@[\w-]+\.[\w.-]+)")


def _resolve_mentions(db: Session, account_id: int, body: str) -> list[int]:
    """Find @email mentions in a comment body, resolved only against
    teammates in the same account — an @mention of an outsider's email is
    just text, never a cross-tenant lookup."""
    emails = set(_MENTION_RE.findall(body))
    if not emails:
        return []
    rows = db.execute(
        select(User.id).where(User.account_id == account_id, User.email.in_(emails))
    ).scalars().all()
    return list(rows)


def add_comment(db: Session, account_id: int, task_id: int, author_id: int, body: str) -> Comment | None:
    task = db.execute(
        select(Task).where(Task.id == task_id, Task.account_id == account_id)
    ).scalar_one_or_none()
    if task is None:
        return None

    mentioned_ids = _resolve_mentions(db, account_id, body)
    comment = Comment(
        account_id=account_id,
        task_id=task_id,
        author_id=author_id,
        body=body,
        mentioned_user_ids=",".join(str(uid) for uid in mentioned_ids),
    )
    db.add(comment)
    db.flush()

    log_activity(
        db, account_id, actor_id=author_id, verb="comment_added",
        target_type="task", target_id=task_id,
        summary=f'commented on "{task.title}"',
    )

    db.commit()
    db.refresh(comment)
    return comment


def list_comments(db: Session, account_id: int, task_id: int) -> list[dict]:
    rows = db.execute(
        select(Comment, User.email)
        .join(User, Comment.author_id == User.id)
        .where(Comment.account_id == account_id, Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
    ).all()
    return [
        {
            "id": c.id,
            "task_id": c.task_id,
            "author_id": c.author_id,
            "author_email": email,
            "body": c.body,
            "mentioned_user_ids": [int(x) for x in c.mentioned_user_ids.split(",") if x],
            "created_at": c.created_at.isoformat(),
        }
        for c, email in rows
    ]


def log_activity(
    db: Session, account_id: int, actor_id: int | None, verb: str, target_type: str, target_id: int, summary: str
) -> ActivityEvent:
    """Record an activity event. Does not commit — callers already hold an
    open transaction for the change that triggered this (task creation,
    status update, etc.); committing here would split that atomicity."""
    event = ActivityEvent(
        account_id=account_id, actor_id=actor_id, verb=verb,
        target_type=target_type, target_id=target_id, summary=summary,
    )
    db.add(event)
    return event


def list_activity(db: Session, account_id: int, limit: int = 50) -> list[dict]:
    rows = db.execute(
        select(ActivityEvent, User.email)
        .join(User, ActivityEvent.actor_id == User.id, isouter=True)
        .where(ActivityEvent.account_id == account_id)
        .order_by(ActivityEvent.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": e.id,
            "actor_id": e.actor_id,
            "actor_email": email,
            "verb": e.verb,
            "target_type": e.target_type,
            "target_id": e.target_id,
            "summary": e.summary,
            "created_at": e.created_at.isoformat(),
        }
        for e, email in rows
    ]
