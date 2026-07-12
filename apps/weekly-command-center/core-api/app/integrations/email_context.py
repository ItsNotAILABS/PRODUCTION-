"""Email as context, not tasks — scoped per account. Drop .eml files into
core-api/data/inbox/<account_id>/ and this scans them for the sender's
subject and any dates mentioned in the body, recording them as read-only
context on that account's digest. It deliberately never creates a task from
an email — the request was explicit that email should inform the week, not
command it. If a deliverable title is mentioned in the subject/body it gets
soft-linked so the digest can say "your Q3 report deadline was mentioned in
2 emails this week."
"""
from __future__ import annotations

import email
import re
from email.policy import default as default_policy
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import deliverables as deliverables_mod
from ..db_models import InboxEvent

INBOX_ROOT = Path(__file__).resolve().parent.parent.parent / "data" / "inbox"

DATE_PATTERNS = [
    re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),
    re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b"),
]


def _account_inbox_dir(account_id: int) -> Path:
    d = INBOX_ROOT / str(account_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def scan_inbox(db: Session, account_id: int) -> list[dict]:
    """Parse every .eml under this account's inbox dir not already imported,
    return the newly created context rows."""
    already = {
        r[0] for r in db.execute(
            select(InboxEvent.subject).where(InboxEvent.account_id == account_id)
        ).all()
    }
    deliverable_titles = {
        d.title.lower(): d.id for d in deliverables_mod.list_deliverables(db, account_id)
    }

    created = []
    for eml_path in sorted(_account_inbox_dir(account_id).glob("*.eml")):
        msg = email.message_from_bytes(eml_path.read_bytes(), policy=default_policy)
        subject = msg.get("subject", "(no subject)")
        if subject in already:
            continue
        body = _extract_body(msg)
        mentioned_date = _first_date(body) or _first_date(subject)
        linked_id = None
        haystack = f"{subject} {body}".lower()
        for title, deliverable_id in deliverable_titles.items():
            if title in haystack:
                linked_id = deliverable_id
                break

        db.add(InboxEvent(
            account_id=account_id, source="email", subject=subject,
            mentioned_date=mentioned_date, raw_snippet=body[:280], linked_deliverable_id=linked_id,
        ))
        created.append({"subject": subject, "mentioned_date": mentioned_date, "linked_deliverable_id": linked_id})

    db.commit()
    return created


def _extract_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_content()
        return ""
    return msg.get_content() if msg.get_content_type() == "text/plain" else ""


def _first_date(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        m = pattern.search(text or "")
        if m:
            return m.group(1)
    return None
