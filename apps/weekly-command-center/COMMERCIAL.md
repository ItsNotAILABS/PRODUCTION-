# Commercial Deployment & Operations

This guide covers deploying Weekly Command Center as a commercial SaaS product with real payment processing, email notifications, and production operations.

## Pre-Launch Checklist

### 1. Stripe Setup
Required to accept real payments:

```bash
# 1. Create Stripe account at https://stripe.com
# 2. Get API keys from Settings → API keys → Reveal test/live key
# 3. Create price objects for your plans in Stripe Dashboard

# Stripe Price IDs (example):
# - Free: (no price ID needed)
# - Pro: price_1234567890 ($/month)
# - Team: price_9876543210 ($/month)

# 4. Update your plan definitions with Stripe Price IDs:
# (See core-api/app/billing.py DEFAULT_PLANS)

# 5. Create a webhook endpoint at Settings → Webhooks
# Webhook URL: https://yourdomain.com/billing/webhook/stripe
# Events to listen for:
#   - checkout.session.completed
#   - customer.subscription.updated
#   - charge.failed

# 6. Set environment variables:
export STRIPE_API_KEY="sk_live_..."          # or sk_test_... for development
export STRIPE_WEBHOOK_SECRET="whsec_..."     # from Webhook signing secret
```

### 2. Email Setup
For transactional emails (welcome, confirmations, support):

```bash
# Option A: SendGrid (recommended for SaaS)
export SENDGRID_API_KEY="SG...."
export SENDGRID_FROM_EMAIL="noreply@yourcompany.com"

# Option B: AWS SES
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
export SES_FROM_EMAIL="noreply@yourcompany.com"

# Option C: SMTP (e.g., Gmail, Mailgun)
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="587"
export SMTP_USER="..."
export SMTP_PASSWORD="..."
export SMTP_FROM_EMAIL="..."
```

### 3. Database
For production, use a managed PostgreSQL service:

```bash
# AWS RDS, Azure Database for PostgreSQL, or Heroku Postgres
export DATABASE_URL="postgresql+psycopg2://user:pass@host:5432/wcc_prod"

# Run migrations on first deployment:
cd core-api
alembic upgrade head
```

### 4. Security Hardening

```bash
# HTTPS/TLS (required for payments)
# Use a reverse proxy (nginx, Cloudflare, AWS ALB) with TLS termination

# JWT Secret (generate random string)
export JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"

# CORS Origins (restrict to your domain)
export CORS_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"

# Rate limiting (per IP, per user)
# TODO: Implement in middleware

# Database user isolation (separate read-only account for backups)
# TODO: Create read-only replica user
```

### 5. Monitoring & Alerting

```bash
# Datadog / New Relic / Sentry setup
export SENTRY_DSN="https://key@sentry.io/..."
export DATADOG_API_KEY="..."
export DATADOG_APP_KEY="..."

# Log aggregation
export LOG_LEVEL="INFO"
export LOG_FORMAT="json"  # For log parsers
```

### 6. Backups & Disaster Recovery

```bash
# Automated daily backups (PostgreSQL)
# - AWS: RDS automated backups (7-35 days retention)
# - Azure: Automated backups to geo-redundant storage
# - Manual: pg_dump to S3/GCS every 6 hours

# Restore procedure (test monthly):
# 1. Restore to temporary database
# 2. Run schema validation (alembic current)
# 3. Spot-check key data
# 4. Promote temp database to primary if needed
```

## Deployment Environments

### Local Development
```bash
./run_local.sh
# Runs without Stripe (simulated) for testing
```

### Staging
```bash
# Same as production, but with:
# - Stripe test keys (sk_test_...)
# - Test email addresses (SendGrid sandbox)
# - Reduced database retention (7 days backups instead of 30)
# - Smaller instance sizes (save on costs during testing)

docker-compose -f docker-compose.prod.yml up -d
```

### Production
```bash
# Full deployment with real keys, monitoring, backups
# See DEPLOY.md for instructions specific to your hosting provider
```

## Billing Flow

### Plan Upgrade
```
1. User clicks "Upgrade to Pro"
2. POST /billing/upgrade?plan_id=pro
3. API creates Stripe Checkout Session
4. User is redirected to stripe.com/checkout/...
5. User enters card details, clicks "Pay"
6. Stripe processes payment (real-time)
7. User is redirected to success_url
8. Webhook: checkout.session.completed
9. API updates account.plan_id in database
10. User gains access to new plan features
```

### Downgrade / Cancellation
```
1. User clicks "Downgrade to Free"
2. API creates prorated invoice
3. Stripe charges difference (or credits)
4. Webhook: customer.subscription.updated
5. API updates account.plan_id
6. Features immediately limited to free tier
```

## Usage & Limits

Real-time enforcement via `billing.enforce_limit()`:

```python
# Trying to create a task when at plan limit:
POST /tasks
→ 402 Payment Required
→ "Plan 'free' limit reached for open_tasks (15/15). Upgrade to continue."
```

Usage is always real-time (no asynchronous billing):
- `POST /billing/plan` shows current usage vs plan limits
- Limits are checked on every resource creation
- No "soft limits" or grace periods (hard stops)

This means:
- Free plan users see paywall immediately
- Upgrade conversions are high (frictionless checkout)
- No revenue leakage from free users going over limits

## Email Templates

Create these in your email service provider (SendGrid / AWS SES):

### Welcome Email
```
Subject: Welcome to Weekly Command Center
Recipient: new_user_email

Hi {{name}},
Welcome to Weekly Command Center! You're on the {{plan}} plan.

Get started:
1. Create your first week
2. Add tasks and deliverables
3. Invite teammates ({{max_users}} users included)

Learn more: https://docs.weeklycommandcenter.com/getting-started
```

### Upgrade Confirmation
```
Subject: Your {{plan}} subscription is active
Recipient: account_owner_email

Great! Your account has been upgraded to {{plan}}.

New features:
- {{max_users}} users (was {{old_max_users}})
- {{max_open_tasks}} open tasks (was {{old_max_open_tasks}})
- {{max_deliverables}} deliverables (was {{old_max_deliverables}})

Billing: ${{price}} / month, next renewal {{renewal_date}}
Invoice: https://dashboard.stripe.com/invoices/{{invoice_id}}

Change plan: https://app.weeklycommandcenter.com/billing
```

### Payment Failed
```
Subject: Payment failed for your Weekly Command Center subscription
Recipient: account_owner_email

Your payment on {{date}} for ${{amount}} failed: {{failure_reason}}

Your account remains active until {{expiry_date}}.

Update payment: https://app.weeklycommandcenter.com/billing/payment
Contact support: support@weeklycommandcenter.com
```

## Analytics & Dashboards

Key metrics to track:

### Financial
- **MRR** (Monthly Recurring Revenue): Sum of all active subscriptions
- **ARR** (Annual Recurring Revenue): MRR × 12
- **Churn Rate**: % of customers who downgrade/cancel each month
- **LTV** (Lifetime Value): Average revenue per customer over lifetime
- **CAC** (Customer Acquisition Cost): Marketing spend ÷ new customers

### Product
- **DAU/MAU**: Daily/Monthly Active Users
- **Retention**: % of users active after 30/60/90 days
- **Feature Adoption**: % of users using task scheduling, deliverables, etc.
- **Performance**: API response times, error rates, uptime %

### Support
- **MTTR** (Mean Time To Resolution): Average support ticket time
- **CSAT** (Customer Satisfaction): NPS or 5-star rating

Create dashboards in Datadog / Grafana:

```bash
# Example: MRR dashboard
SELECT SUM(price_cents) / 100 / 100
FROM accounts a
JOIN plans p ON a.plan_id = p.id
WHERE p.price_cents > 0
GROUP BY DATE_TRUNC('month', a.created_at)
```

## Customer Support

### Support Channels
1. **Email**: support@weeklycommandcenter.com (monitored 24/5)
2. **In-app Chat**: (future integration with Intercom/Drift)
3. **Help Center**: Notion / GitHub Pages with docs
4. **Status Page**: https://status.weeklycommandcenter.com (StatusPage.io)

### Escalation Path
```
User → Help Center (self-service)
   ↓ (if not resolved)
   → Support Email (L1 support, 24h response)
   ↓ (if bug/critical)
   → Engineering (L2, reproduced locally)
   ↓ (if infrastructure)
   → Ops Team (L3, incident response)
```

### Privacy & Legal
- **Privacy Policy**: Disclose data collection, Stripe payment processing
- **Terms of Service**: Limits of liability, uptime SLA (99.5%)
- **Data Processing Agreement (DPA)**: Required for GDPR compliance
- **Acceptable Use Policy**: No scraping, abuse, malware distribution

Resources:
- Privacy: https://www.iubenda.com/ (auto-generates)
- Terms: https://termly.io/ (auto-generates)
- Legal review: Engage lawyer for DPA/compliance

## Incident Response

### Database Down
```
1. Check database status (RDS console, logs)
2. If connectivity issue: restart database
3. If data corruption: restore from backup
4. Verify schema: alembic current (should show "head")
5. Notify customers via status page
6. Post-mortem within 24 hours
```

### Payment Processing Down (Stripe API unavailable)
```
1. Stripe Status Page: https://status.stripe.com/
2. Disable upgrade button: render "Payment processing temporarily unavailable"
3. Queue payment jobs locally (will retry when Stripe returns)
4. No revenue loss (jobs retry automatically)
5. Resume accepting payments after Stripe recovers
```

### DDoS / Abuse
```
1. Enable Cloudflare DDoS protection
2. Block by IP / geographic origin
3. Implement rate limiting (100 requests/minute per IP)
4. Contact abuse@weeklycommandcenter.com for reports
5. Notify affected customers if data exposed
```

## First Year Milestones

```
Month 1: Launch MVP
  - 10 paying customers, $190 MRR

Month 2-3: Gain traction
  - 50 customers, $950 MRR
  - NPS > 40

Month 4-6: Product-market fit
  - 200 customers, $3,800 MRR
  - <5% monthly churn
  - <20% CAC payback period

Month 7-12: Scale
  - 500 customers, $9,500 MRR
  - Add team features (team calendar, integrations)
  - Expand to mobile app
```

## Future Work

- [ ] Team collaboration features (shared calendars, @mentions)
- [ ] Mobile app (iOS/Android) for task management on-the-go
- [ ] Integrations (Slack, Google Calendar, Microsoft Teams)
- [ ] AI features (auto-scheduling, smart deadlines)
- [ ] Enterprise plan ($99/month, unlimited users, SSO, audit logs)
- [ ] White-label / reseller program
- [ ] SLA guarantees (99.99% uptime)
