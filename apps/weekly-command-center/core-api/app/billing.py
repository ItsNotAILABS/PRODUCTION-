"""Billing: plan catalog, usage metering, and upgrade checkout.

Integrates with Stripe for payment processing:
- Plans define pricing and limits (free, pro, team)
- upgrade_account creates a Stripe Checkout Session for payment
- Webhook handler updates account plan after successful payment
- All usage tracking and limits are real-time, even without payment

Usage limits are enforced immediately (402 Payment Required) even for free plans.
Stripe integration is optional — if not configured, upgrades are simulated for testing.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import get_current_account, get_current_user
from .database import get_db
from .db_models import Account, Deliverable, Plan, Task, User
from .emails import send_payment_failed_email, send_upgrade_confirmation_email
from . import stripe_client

logger = logging.getLogger("billing")

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


# Stripe webhook endpoint (public, no auth required)
@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events.

    Stripe sends events to this endpoint to notify of payment status changes.
    Events are signature-verified before processing.

    Supported events:
    - checkout.session.completed: Payment successful, upgrade account
    - customer.subscription.updated: Subscription changed (downgrade/cancel)
    - charge.failed: Payment failed, notify user
    """
    from fastapi import Request

    body = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature:
        logger.warning("webhook request missing stripe-signature header")
        raise HTTPException(400, "Missing stripe-signature header")

    try:
        event = stripe_client.construct_webhook_event(body, signature)
    except stripe_client.SignatureVerificationError:
        raise HTTPException(403, "Invalid signature")
    except ValueError as e:
        raise HTTPException(400, str(e))

    event_type = event.get("type")
    logger.info("stripe webhook: type=%s event_id=%s", event_type, event.get("id"))

    if event_type == "checkout.session.completed":
        return await _handle_checkout_completed(event.get("data", {}).get("object", {}))
    elif event_type == "customer.subscription.updated":
        return await _handle_subscription_updated(event.get("data", {}).get("object", {}))
    elif event_type == "charge.failed":
        return await _handle_charge_failed(event.get("data", {}).get("object", {}))
    else:
        logger.debug("ignoring event type: %s", event_type)
        return {"received": True}


async def _handle_checkout_completed(session_data: dict) -> dict:
    """Handle successful checkout — upgrade the account."""
    from .database import SessionLocal as SessionFactory

    result = stripe_client.handle_checkout_session_completed(session_data)
    account_id = result.get("account_id")
    plan_id = result.get("plan_id")

    if not account_id or not plan_id:
        logger.error("checkout event missing account_id or plan_id: %s", result)
        return {"error": "missing metadata"}

    with SessionFactory() as db:
        account = db.get(Account, account_id)
        if not account:
            logger.error("checkout for unknown account: account_id=%d", account_id)
            return {"error": "account not found"}

        plan = db.get(Plan, plan_id)
        if not plan:
            logger.error("checkout for unknown plan: plan_id=%s", plan_id)
            return {"error": "plan not found"}

        old_plan = account.plan_id
        account.plan_id = plan.id
        db.commit()

        logger.info(
            "account upgraded via checkout: account_id=%d %s → %s subscription=%s",
            account_id,
            old_plan,
            plan_id,
            result.get("subscription_id"),
        )

        customer_email = result.get("customer_email")
        if customer_email:
            send_upgrade_confirmation_email(customer_email, plan.name, plan.price_cents)

    return {"received": True, "account_id": account_id, "plan_id": plan_id}


async def _handle_subscription_updated(subscription_data: dict) -> dict:
    """Handle subscription updates (downgrades, cancellations, etc.)."""
    result = stripe_client.handle_customer_subscription_updated(subscription_data)
    logger.info(
        "subscription updated: subscription_id=%s status=%s",
        result.get("subscription_id"),
        result.get("status"),
    )
    # TODO: handle downgrade/cancellation logic
    return {"received": True}


async def _handle_charge_failed(charge_data: dict) -> dict:
    """Handle payment failures."""
    logger.warning(
        "charge failed: charge_id=%s amount=%s reason=%s",
        charge_data.get("id"),
        charge_data.get("amount"),
        charge_data.get("failure_message"),
    )

    customer_email = (charge_data.get("billing_details") or {}).get("email")
    if customer_email:
        send_payment_failed_email(
            customer_email,
            charge_data.get("amount", 0),
            charge_data.get("failure_message"),
        )

    return {"received": True}


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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Initiate plan upgrade via Stripe Checkout Session.

    If Stripe is configured, redirects to a checkout session where the user
    pays. The account plan is updated via webhook after payment succeeds.

    If Stripe is not configured, the upgrade is simulated immediately (for testing).

    Returns:
        - checkout_url: Redirect here for payment (if Stripe enabled)
        - account_id/plan_id: Updated account (if Stripe disabled)
    """
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(404, "unknown plan")

    # If already on this plan, no upgrade needed
    if account.plan_id == plan.id:
        return {
            "message": "already on this plan",
            "account_id": account.id,
            "plan_id": account.plan_id,
        }

    # Free to free upgrade is allowed (no payment)
    if plan.price_cents == 0 and account.plan.price_cents == 0:
        logger.info("free plan switch: account_id=%d %s → %s", account.id, account.plan_id, plan.id)
        account.plan_id = plan.id
        db.commit()
        return {
            "account_id": account.id,
            "plan_id": account.plan_id,
            "message": "plan updated (free)",
        }

    # Free to paid or paid to paid requires Stripe (for real payment)
    # But in tests/development without Stripe configured, allow it for testing
    if not stripe_client.STRIPE_ENABLED:
        logger.warning(
            "upgrade without Stripe: simulated (test mode). account_id=%d plan=%s",
            account.id,
            plan_id,
        )
        # In test mode, directly upgrade (no payment processing)
        account.plan_id = plan.id
        db.commit()
        send_upgrade_confirmation_email(user.email, plan.name, plan.price_cents)
        return {
            "account_id": account.id,
            "plan_id": account.plan_id,
            "message": "plan updated (test mode — no payment processed)",
        }

    if not plan.stripe_price_id:
        logger.error("plan has no stripe_price_id: plan_id=%s", plan.id)
        raise HTTPException(500, "Plan not available for purchase. Contact support.")

    try:
        # Create Stripe checkout session
        result = stripe_client.create_checkout_session(
            account_id=account.id,
            plan_id=plan.id,
            stripe_price_id=plan.stripe_price_id,
            user_email=user.email,
            success_url="https://app.weeklycommandcenter.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://app.weeklycommandcenter.com/billing?cancelled=true",
        )

        logger.info(
            "checkout session created: account_id=%d plan=%s session=%s",
            account.id,
            plan.id,
            result["session_id"],
        )

        return {
            "checkout_url": result["checkout_url"],
            "session_id": result["session_id"],
        }

    except ValueError as e:
        logger.error("upgrade error: %s", str(e), extra={"account_id": account.id})
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("unexpected upgrade error: %s", str(e), extra={"account_id": account.id})
        raise HTTPException(500, "Payment processing failed. Please try again.")
