"""Stripe payment processing for billing.

Handles:
- Creating checkout sessions for plan upgrades
- Processing webhook events (checkout.session.completed, customer.subscription.updated)
- Validating webhook signatures
- Error handling and logging
"""
from __future__ import annotations

import json
import logging
import os
from typing import TypedDict

import stripe
from stripe.error import SignatureVerificationError

logger = logging.getLogger("stripe_client")

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
STRIPE_ENABLED = bool(STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET)

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY


class CheckoutSessionResult(TypedDict):
    """Response from creating a Stripe checkout session."""
    checkout_url: str
    session_id: str
    client_secret: str | None


def create_checkout_session(
    account_id: int,
    plan_id: str,
    stripe_price_id: str,
    user_email: str,
    success_url: str,
    cancel_url: str,
) -> CheckoutSessionResult:
    """Create a Stripe Checkout Session for a plan upgrade.

    Args:
        account_id: Internal account ID (stored in session metadata for webhook)
        plan_id: Internal plan ID ('free', 'pro', 'team')
        stripe_price_id: Stripe Price ID (from plans.stripe_price_id)
        user_email: Customer email for Stripe
        success_url: Redirect URL after successful payment (include {CHECKOUT_SESSION_ID})
        cancel_url: Redirect URL if customer cancels

    Returns:
        CheckoutSessionResult with checkout_url for redirect

    Raises:
        ValueError: If Stripe is not configured or price_id is missing
        stripe.error.StripeError: On Stripe API errors (invalid price, rate limits, etc.)
    """
    if not STRIPE_ENABLED:
        raise ValueError("Stripe is not configured (STRIPE_API_KEY or STRIPE_WEBHOOK_SECRET missing)")

    if not stripe_price_id:
        raise ValueError(f"Plan '{plan_id}' has no stripe_price_id configured")

    try:
        session = stripe.checkout.Session.create(
            customer_email=user_email,
            line_items=[
                {
                    "price": stripe_price_id,
                    "quantity": 1,
                }
            ],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "account_id": str(account_id),
                "plan_id": plan_id,
            },
        )

        logger.info(
            "created checkout session: account_id=%d plan_id=%s session_id=%s email=%s",
            account_id,
            plan_id,
            session.id,
            user_email,
        )

        return {
            "checkout_url": session.url,
            "session_id": session.id,
            "client_secret": session.client_secret,
        }

    except stripe.error.StripeError as e:
        logger.error("stripe checkout error: %s", str(e), extra={"account_id": account_id})
        raise


def construct_webhook_event(request_body: bytes, signature: str) -> dict:
    """Verify and parse a Stripe webhook event.

    Args:
        request_body: Raw HTTP request body
        signature: Stripe-Signature header

    Returns:
        Parsed webhook event dict

    Raises:
        SignatureVerificationError: If signature is invalid
        ValueError: If request_body cannot be parsed as JSON
    """
    if not STRIPE_WEBHOOK_SECRET:
        raise ValueError("Stripe webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            request_body,
            signature,
            STRIPE_WEBHOOK_SECRET,
        )
        return event
    except SignatureVerificationError as e:
        logger.warning("invalid webhook signature: %s", str(e))
        raise
    except ValueError as e:
        logger.error("webhook request body could not be parsed: %s", str(e))
        raise


def handle_checkout_session_completed(session_data: dict) -> dict:
    """Handle checkout.session.completed webhook event.

    Returns metadata for the application to update billing:
    - account_id: Which account to upgrade
    - plan_id: Which plan to set
    - stripe_session_id: For audit logging
    """
    metadata = session_data.get("metadata", {})
    return {
        "account_id": int(metadata.get("account_id", 0)),
        "plan_id": metadata.get("plan_id"),
        "stripe_session_id": session_data.get("id"),
        "customer_email": session_data.get("customer_email"),
        "subscription_id": session_data.get("subscription"),
    }


def handle_customer_subscription_updated(subscription_data: dict) -> dict:
    """Handle customer.subscription.updated webhook event (e.g., downgrade, cancellation).

    Logs subscription changes for audit trail. Future: handle downgrades/cancellations.
    """
    return {
        "subscription_id": subscription_data.get("id"),
        "status": subscription_data.get("status"),
        "metadata": subscription_data.get("metadata", {}),
    }
