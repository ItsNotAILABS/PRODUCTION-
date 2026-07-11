"""Business analytics: MRR/ARR, plan distribution, signup cohorts, and a
retention proxy — aggregated across every account (admin-only; see
admin_auth.py). Nothing here is dialect-specific SQL: date bucketing is done
in Python so the same queries run unmodified on SQLite and Postgres, matching
the rest of this app's persistence layer.
"""
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .admin_auth import require_admin
from .database import get_db
from .db_models import Account, Deliverable, Plan, Task, User, Week

router = APIRouter(prefix="/admin/analytics", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """MRR/ARR, account/user counts, and paying-vs-free split."""
    rows = db.execute(
        select(Account.plan_id, Plan.price_cents, func.count(Account.id))
        .join(Plan, Account.plan_id == Plan.id)
        .group_by(Account.plan_id, Plan.price_cents)
    ).all()

    mrr_cents = sum(price_cents * count for _, price_cents, count in rows if price_cents > 0)
    total_accounts = sum(count for _, _, count in rows)
    paying_accounts = sum(count for _, price_cents, count in rows if price_cents > 0)
    total_users = db.execute(select(func.count()).select_from(User)).scalar_one()

    return {
        "mrr_cents": mrr_cents,
        "arr_cents": mrr_cents * 12,
        "total_accounts": total_accounts,
        "paying_accounts": paying_accounts,
        "free_accounts": total_accounts - paying_accounts,
        "total_users": total_users,
        "avg_revenue_per_paying_account_cents": (
            mrr_cents // paying_accounts if paying_accounts else 0
        ),
    }


@router.get("/plans")
def plan_distribution(db: Session = Depends(get_db)):
    """How many accounts are on each plan — the funnel from free to paid."""
    rows = db.execute(
        select(Plan.id, Plan.name, Plan.price_cents, func.count(Account.id))
        .join(Account, Account.plan_id == Plan.id, isouter=True)
        .group_by(Plan.id, Plan.name, Plan.price_cents)
    ).all()
    return [
        {"plan_id": pid, "name": name, "price_cents": price_cents, "account_count": count}
        for pid, name, price_cents, count in rows
    ]


@router.get("/usage")
def usage_totals(db: Session = Depends(get_db)):
    """Aggregate platform usage — total tasks/deliverables and per-account
    averages, a proxy for how deeply accounts are using the product."""
    total_accounts = db.execute(select(func.count()).select_from(Account)).scalar_one()
    total_tasks = db.execute(select(func.count()).select_from(Task)).scalar_one()
    open_tasks = db.execute(
        select(func.count()).select_from(Task).where(Task.status != "done")
    ).scalar_one()
    total_deliverables = db.execute(select(func.count()).select_from(Deliverable)).scalar_one()

    return {
        "total_accounts": total_accounts,
        "total_tasks": total_tasks,
        "open_tasks": open_tasks,
        "total_deliverables": total_deliverables,
        "avg_tasks_per_account": (total_tasks / total_accounts) if total_accounts else 0,
        "avg_deliverables_per_account": (total_deliverables / total_accounts) if total_accounts else 0,
    }


@router.get("/signups")
def signup_cohorts(weeks: int = 12, db: Session = Depends(get_db)):
    """New accounts per ISO week over the trailing `weeks` window — the
    top-of-funnel growth curve."""
    created_dates = db.execute(select(Account.created_at)).scalars().all()
    return {"weeks": _bucket_by_iso_week(created_dates, weeks)}


@router.get("/retention")
def retention(weeks: int = 8, db: Session = Depends(get_db)):
    """Retention proxy: distinct accounts with a Week row (i.e., that opened
    the app and had a week anchored) in each of the trailing ISO weeks.
    Week.week_start is already an ISO date string set at creation time, so
    this reads real usage, not a login/session log we don't keep."""
    rows = db.execute(select(Week.account_id, Week.week_start)).all()

    buckets: dict[str, set[int]] = {}
    for account_id, week_start in rows:
        buckets.setdefault(week_start, set()).add(account_id)

    sorted_starts = sorted(buckets.keys(), reverse=True)[:weeks]
    return {
        "weeks": [
            {"week_start": week_start, "active_accounts": len(buckets[week_start])}
            for week_start in sorted(sorted_starts)
        ]
    }


def _bucket_by_iso_week(dates: list[datetime.datetime], weeks: int) -> list[dict]:
    from .calendars import week_bounds

    counts: dict[str, int] = {}
    for dt in dates:
        start, _ = week_bounds(dt.date() if isinstance(dt, datetime.datetime) else dt)
        key = start.isoformat()
        counts[key] = counts.get(key, 0) + 1

    sorted_keys = sorted(counts.keys(), reverse=True)[:weeks]
    return [{"week_start": k, "signups": counts[k]} for k in sorted(sorted_keys)]
