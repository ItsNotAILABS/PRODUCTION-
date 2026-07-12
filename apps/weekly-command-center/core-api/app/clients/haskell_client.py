"""Bridge to the Haskell task-language parser microservice
(taskrules-haskell/) — the "ancient task language" root layer: a compact DSL
for describing a task in one line, parsed with a real recursive-descent
parser written in Haskell (src/TaskLang.hs). Falls back to an equivalent
Python regex parser when the service isn't running.

DSL grammar (order-independent tokens after the title):
    <free text title> [due:ISO8601] [!priority(1-5)] [~estimateMinutes|~1h30m]
                       [#tag ...] [@deliverable:Name] [^parent:id]

Example:
    "Draft Q3 report due:2026-07-10T17:00 !1 ~2h #client-acme @deliverable:Q3-report"
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

TASKRULES_URL = os.environ.get("TASKRULES_URL", "http://localhost:8200")
TIMEOUT_SECONDS = 2.0

_TOKEN_RE = re.compile(
    r"(?:due:(?P<due>\S+))"
    r"|(?:!(?P<priority>[1-5]))"
    r"|(?:~(?P<estimate>[\w.]+))"
    r"|(?:#(?P<tag>\S+))"
    r"|(?:@deliverable:(?P<deliverable>\S+))"
    r"|(?:\^parent:(?P<parent>\S+))"
)

_DURATION_RE = re.compile(r"(?:(\d+)h)?(?:(\d+)m)?$")


def parse(line: str) -> dict:
    try:
        req = urllib.request.Request(
            f"{TASKRULES_URL}/parse",
            data=json.dumps({"line": line}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            result = json.loads(resp.read())
            result["engine"] = "haskell"
            return result
    except (urllib.error.URLError, TimeoutError, OSError):
        return _fallback_parse(line)


def _fallback_parse(line: str) -> dict:
    tags = []
    due = None
    priority = 3
    estimate_minutes = 0
    deliverable = None
    parent = None

    remainder = line
    for m in _TOKEN_RE.finditer(line):
        remainder = remainder.replace(m.group(0), "", 1)
        if m.group("due"):
            due = m.group("due")
        elif m.group("priority"):
            priority = int(m.group("priority"))
        elif m.group("estimate"):
            estimate_minutes = _parse_duration(m.group("estimate"))
        elif m.group("tag"):
            tags.append(m.group("tag"))
        elif m.group("deliverable"):
            deliverable = m.group("deliverable")
        elif m.group("parent"):
            parent = m.group("parent")

    title = re.sub(r"\s+", " ", remainder).strip()
    return {
        "engine": "python-fallback",
        "title": title,
        "due": due,
        "priority": priority,
        "estimate_minutes": estimate_minutes,
        "tags": tags,
        "deliverable": deliverable,
        "parent": parent,
    }


def _parse_duration(token: str) -> int:
    if token.isdigit():
        return int(token)
    m = _DURATION_RE.match(token)
    if not m or not any(m.groups()):
        return 0
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    return hours * 60 + minutes
