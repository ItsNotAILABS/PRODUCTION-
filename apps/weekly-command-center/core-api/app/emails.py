"""Transactional email: welcome, teammate invites, billing confirmations,
payment failures.

Pluggable provider selected by environment variables, checked in this order:
  1. SendGrid   (SENDGRID_API_KEY)
  2. AWS SES    (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + SES_FROM_EMAIL)
  3. SMTP       (SMTP_HOST)
  4. Console    (default — logs the email instead of sending; always available,
                 so signup/invite/billing flows never hard-fail in dev/test)

Every send goes through `send_email()`; template rendering is simple string
substitution (no Jinja dependency) since these are short, fixed-shape emails.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Protocol

logger = logging.getLogger("emails")

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@weeklycommandcenter.com")

AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
SES_FROM_EMAIL = os.environ.get("SES_FROM_EMAIL", "noreply@weeklycommandcenter.com")

SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "noreply@weeklycommandcenter.com")


class EmailProvider(Protocol):
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None: ...


class SendGridProvider:
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        import urllib.request
        import json as _json

        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": SENDGRID_FROM_EMAIL},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text_body},
                {"type": "text/html", "value": html_body},
            ],
        }
        req = urllib.request.Request(
            "https://api.sendgrid.com/v3/mail/send",
            data=_json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"SendGrid returned {resp.status}")


class SESProvider:
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        import boto3

        client = boto3.client(
            "ses",
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )
        client.send_email(
            Source=SES_FROM_EMAIL,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Text": {"Data": text_body},
                    "Html": {"Data": html_body},
                },
            },
        )


class SMTPProvider:
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5.0) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to], msg.as_string())


class ConsoleProvider:
    """Default fallback — logs instead of sending. Keeps signup/invite/billing
    flows fully functional (and testable) with no email provider configured."""

    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        logger.info("EMAIL (console fallback) to=%s subject=%r\n%s", to, subject, text_body)


def _select_provider() -> EmailProvider:
    if SENDGRID_API_KEY:
        return SendGridProvider()
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        return SESProvider()
    if SMTP_HOST:
        return SMTPProvider()
    return ConsoleProvider()


_provider: EmailProvider | None = None


def get_provider() -> EmailProvider:
    global _provider
    if _provider is None:
        _provider = _select_provider()
        logger.info("email provider selected: %s", type(_provider).__name__)
    return _provider


def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    """Send an email, logging (not raising) on failure — a transactional email
    bounce should never break the signup/billing request that triggered it."""
    try:
        get_provider().send(to, subject, html_body, text_body)
    except Exception:
        logger.exception("failed to send email to=%s subject=%r", to, subject)


# --- Templates ---------------------------------------------------------------

def send_welcome_email(to: str, account_name: str, plan_name: str) -> None:
    subject = "Welcome to Weekly Command Center"
    text = (
        f"Hi,\n\nWelcome to Weekly Command Center! Your account \"{account_name}\" "
        f"is on the {plan_name} plan.\n\n"
        f"Get started:\n"
        f"1. Create your first week\n"
        f"2. Add tasks and deliverables\n"
        f"3. Invite teammates\n\n"
        f"— Weekly Command Center"
    )
    html = (
        f"<p>Hi,</p><p>Welcome to Weekly Command Center! Your account "
        f"<strong>{account_name}</strong> is on the <strong>{plan_name}</strong> plan.</p>"
        f"<p>Get started:</p><ol><li>Create your first week</li>"
        f"<li>Add tasks and deliverables</li><li>Invite teammates</li></ol>"
        f"<p>— Weekly Command Center</p>"
    )
    send_email(to, subject, html, text)


def send_invite_email(to: str, account_name: str, inviter_email: str) -> None:
    subject = f"You've been invited to {account_name} on Weekly Command Center"
    text = (
        f"Hi,\n\n{inviter_email} invited you to join \"{account_name}\" on "
        f"Weekly Command Center.\n\nLog in with this email to get started.\n\n"
        f"— Weekly Command Center"
    )
    html = (
        f"<p>Hi,</p><p><strong>{inviter_email}</strong> invited you to join "
        f"<strong>{account_name}</strong> on Weekly Command Center.</p>"
        f"<p>Log in with this email to get started.</p><p>— Weekly Command Center</p>"
    )
    send_email(to, subject, html, text)


def send_upgrade_confirmation_email(to: str, plan_name: str, price_cents: int) -> None:
    subject = f"Your {plan_name} subscription is active"
    price = f"${price_cents / 100:.2f}"
    text = (
        f"Great! Your account has been upgraded to {plan_name}.\n\n"
        f"Billing: {price} / month\n\n"
        f"Manage your plan: https://app.weeklycommandcenter.com/billing\n\n"
        f"— Weekly Command Center"
    )
    html = (
        f"<p>Great! Your account has been upgraded to <strong>{plan_name}</strong>.</p>"
        f"<p>Billing: {price} / month</p>"
        f"<p><a href=\"https://app.weeklycommandcenter.com/billing\">Manage your plan</a></p>"
        f"<p>— Weekly Command Center</p>"
    )
    send_email(to, subject, html, text)


def send_payment_failed_email(to: str, amount_cents: int, reason: str | None) -> None:
    subject = "Payment failed for your Weekly Command Center subscription"
    amount = f"${amount_cents / 100:.2f}"
    reason_text = reason or "your card was declined"
    text = (
        f"Your payment for {amount} failed: {reason_text}.\n\n"
        f"Your account remains active for now. Please update your payment method:\n"
        f"https://app.weeklycommandcenter.com/billing/payment\n\n"
        f"Contact support: support@weeklycommandcenter.com\n\n"
        f"— Weekly Command Center"
    )
    html = (
        f"<p>Your payment for {amount} failed: {reason_text}.</p>"
        f"<p>Your account remains active for now. Please "
        f"<a href=\"https://app.weeklycommandcenter.com/billing/payment\">update your payment method</a>.</p>"
        f"<p>Contact support: support@weeklycommandcenter.com</p>"
        f"<p>— Weekly Command Center</p>"
    )
    send_email(to, subject, html, text)
