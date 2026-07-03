"""Inner agent — system-side. This is the "inner agent for the system" half
of the two-tier agent split: it runs housekeeping nobody has to ask for, on a
fixed cadence, in-process. It never talks to the user directly; it only
maintains state the outer agent (agents/outer_agent.py) reads from.

Runs three jobs:
  - deadline pressure recompute (every 10 min)
  - Monday rollover check / week continuity (every 10 min, idempotent)
  - library registry rescan (hourly)
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from .. import db, deliverables, library_registry, weeks

logger = logging.getLogger("inner_agent")

_scheduler: BackgroundScheduler | None = None


def _tick_pressure() -> None:
    try:
        n = deliverables.recompute_pressure()
        logger.info("inner_agent: recomputed pressure for %d deliverables", n)
    except Exception:
        logger.exception("inner_agent: pressure recompute failed")


def _tick_week_continuity() -> None:
    try:
        week = weeks.get_or_create_current_week()
        logger.info("inner_agent: current week thread anchored at %s", week["week_start"])
    except Exception:
        logger.exception("inner_agent: week continuity check failed")


def _tick_library_scan() -> None:
    try:
        conn = db.get_conn()
        count = library_registry.persist(conn)
        logger.info("inner_agent: library registry rescanned, %d entries", count)
    except Exception:
        logger.exception("inner_agent: library scan failed")


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _tick_pressure()
    _tick_week_continuity()
    _tick_library_scan()
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(_tick_pressure, "interval", minutes=10, id="pressure")
    scheduler.add_job(_tick_week_continuity, "interval", minutes=10, id="continuity")
    scheduler.add_job(_tick_library_scan, "interval", hours=1, id="library_scan")
    scheduler.start()
    _scheduler = scheduler
    return scheduler


def stop() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
