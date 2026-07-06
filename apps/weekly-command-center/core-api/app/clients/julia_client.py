"""Bridge to the Julia optimizer microservice (optimizer-julia/).

The "intelligent entity" doing week-optimization math is real Julia code
(see optimizer-julia/src/Optimizer.jl) — this module just calls it over HTTP.
If the Julia service isn't running (e.g. you haven't done `docker compose up`
yet, or you're just running the Python core standalone), it falls back to an
equivalent pure-Python heuristic so the platform is never blocked on a
microservice being up.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

OPTIMIZER_URL = os.environ.get("OPTIMIZER_URL", "http://localhost:8100")
TIMEOUT_SECONDS = 2.0


def optimize(tasks: list[dict], daily_capacity_minutes: int) -> dict:
    payload = {"tasks": tasks, "daily_capacity_minutes": daily_capacity_minutes}
    try:
        req = urllib.request.Request(
            f"{OPTIMIZER_URL}/optimize",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            result = json.loads(resp.read())
            result["engine"] = "julia"
            return result
    except (urllib.error.URLError, TimeoutError, OSError):
        return _fallback_optimize(tasks, daily_capacity_minutes)


def _fallback_optimize(tasks: list[dict], daily_capacity_minutes: int) -> dict:
    """Deadline-weighted greedy allocation across a Mon-Fri capacity window.
    Mirrors the Julia service's algorithm; used when that service is offline.
    """
    days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    remaining = {d: daily_capacity_minutes for d in days}
    plan = {d: [] for d in days}
    overflow = []

    def sort_key(t):
        deadline = t.get("deadline") or "9999-12-31"
        return (deadline, t.get("priority", 3))

    for task in sorted(tasks, key=sort_key):
        duration = max(int(task.get("estimate_minutes") or 30), 5)
        placed = False
        for d in days:
            if remaining[d] >= duration:
                plan[d].append({"task_id": task["id"], "title": task["title"], "minutes": duration})
                remaining[d] -= duration
                placed = True
                break
        if not placed:
            overflow.append({"task_id": task["id"], "title": task["title"], "minutes": duration})

    return {
        "engine": "python-fallback",
        "plan": plan,
        "overflow": overflow,
        "remaining_capacity": remaining,
    }
