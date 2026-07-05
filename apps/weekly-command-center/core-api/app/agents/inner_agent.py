"""Inner agent — system-side, runs across every tenant. This is the "inner
agent for the system" half of the two-tier agent split: it runs housekeeping
nobody has to ask for, on a fixed cadence, in-process, for every account on
the platform. It never talks to a user directly; it only maintains state the
outer agent (agents/outer_agent.py) reads from on a per-account basis.

Runs three jobs:
  - deadline pressure recompute, across all accounts (every 10 min)
  - Monday rollover check / week continuity, per account (every 10 min, idempotent)
  - library registry rescan, platform-wide, not tenant data (hourly)
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from .. import deliverables, library_registry, weeks
from ..database import session_scope
from ..db_models import Account

logger = logging.getLogger("inner_agent")

_scheduler: BackgroundScheduler | None = None


def _all_account_ids(db) -> list[int]:
    return [row[0] for row in db.execute(select(Account.id)).all()]


def _tick_pressure() -> None:
    try:
        with session_scope() as db:
            n = deliverables.recompute_pressure(db, account_id=None)
            logger.info("inner_agent: recomputed pressure for %d deliverables across all accounts", n)
    except Exception:
        logger.exception("inner_agent: pressure recompute failed")


def _tick_week_continuity() -> None:
    try:
        with session_scope() as db:
            for account_id in _all_account_ids(db):
                week = weeks.get_or_create_current_week(db, account_id)
                logger.info("inner_agent: account %d week thread anchored at %s", account_id, week.week_start)
    except Exception:
        logger.exception("inner_agent: week continuity check failed")


def _tick_library_scan() -> None:
    try:
        with session_scope() as db:
            count = library_registry.persist(db)
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
