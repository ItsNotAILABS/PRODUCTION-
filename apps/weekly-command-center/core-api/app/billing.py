"""Billing: plan catalog, usage metering, and upgrade endpoint.

This is intentionally a stub with no live payment processor wired in yet —
`stripe_price_id` is null for every plan below. When a real Stripe account
exists, `upgrade_account` is the single place that needs to change: instead
of flipping `account.plan_id` directly, it would create a Stripe Checkout
Session for `plan.stripe_price_id` and flip the plan from the webhook that
confirms payment. Everything else (limits, usage display) is already real.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import get_current_account
from .database import get_db
from .db_models import Account, Deliverable, Plan, Task, User

DEFAULT_PLANS = [
    dict(id="free", name="Free", price_cents=0, max_users=1, max_open_tasks=15, max_deliverables=3),
    dict(id="pro", name="Pro", price_cents=1900, max_users=5, max_open_tasks=200, max_deliverables=50),
    dict(id="team", name="Team", price_cents=4900, max_users=25, max_open_tasks=2000, max_deliverables=500),
]


def ensure_default_plans(session: Session) -> None:
    existing = {p.id for p in session.execute(select(Plan)).scalars().all()}
    for plan_kwargs in DEFAULT_PLANS:
        if plan_kwargs["id"] not in existing:
            session.add(Plan(**plan_kwargs))
    session.commit()


def get_usage(session: Session, account_id: int) -> dict:
    users = session.execute(
        select(func.count()).select_from(User).where(User.account_id == account_id)
    ).scalar_one()
    open_tasks = session.execute(
        select(func.count()).select_from(Task).where(Task.account_id == account_id, Task.status != "done")
    ).scalar_one()
    deliverables = session.execute(
        select(func.count()).select_from(Deliverable).where(Deliverable.account_id == account_id)
    ).scalar_one()
    return {"users": users, "open_tasks": open_tasks, "deliverables": deliverables}


def enforce_limit(session: Session, account: Account, resource: str) -> None:
    """Call before creating a `resource` ('users' | 'open_tasks' | 'deliverables').
    Raises 402 Payment Required if the account's plan limit is already hit —
    a real paywall gate, even though no payment is actually processed yet.
    """
    plan = account.plan
    usage = get_usage(session, account.id)
    limit_field = {"users": "max_users", "open_tasks": "max_open_tasks", "deliverables": "max_deliverables"}[resource]
    limit = getattr(plan, limit_field)
    if usage[resource] >= limit:
        raise HTTPException(
            status_code=402,
            detail=f"Plan '{plan.id}' limit reached for {resource} ({usage[resource]}/{limit}). Upgrade to continue.",
        )


router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    plans = db.execute(select(Plan)).scalars().all()
    return [
        {
            "id": p.id, "name": p.name, "price_cents": p.price_cents,
            "max_users": p.max_users, "max_open_tasks": p.max_open_tasks,
            "max_deliverables": p.max_deliverables,
        }
        for p in plans
    ]


@router.get("/plan")
def current_plan(account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    usage = get_usage(db, account.id)
    plan = account.plan
    return {
        "plan": {
            "id": plan.id, "name": plan.name, "price_cents": plan.price_cents,
            "max_users": plan.max_users, "max_open_tasks": plan.max_open_tasks,
            "max_deliverables": plan.max_deliverables,
        },
        "usage": usage,
    }


@router.post("/upgrade")
def upgrade_account(
    plan_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(404, "unknown plan")
    # Stub: no payment is collected. A real integration would redirect to a
    # Stripe Checkout Session here and only flip plan_id from the
    # `checkout.session.completed` webhook.
    account.plan_id = plan.id
    db.commit()
    return {"account_id": account.id, "plan_id": account.plan_id, "note": "stub upgrade — no payment processed"}
