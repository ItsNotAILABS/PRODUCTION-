# Aether Cloud

The commercial, multi-tenant, billed edition of the Aether Sovereign
Console. Kept as a **separate app from `apps/aether-console`** on
purpose: the free console's whole pitch is "you own your infra, deploy
it to your own Cloudflare account" — bolting subscription billing onto
that would contradict the pitch. Aether Cloud is the opposite model: you
(the operator) run this, customers sign up and get an API key, and you
bill them.

Both apps share the same core route logic
(`apps/aether-console/functions/api/core.js` — imported here, not
forked) so a fleet/workload/protocol/policy call behaves identically
whether it's free-and-self-hosted or paid-and-managed. What's unique to
this app is everything commercial: signup, API keys, per-tenant state
isolation, plan limits, and Stripe billing.

## What's real vs. what needs your credentials

**Verified by actually running it** (see the exact test commands in this
session's history, or re-run them yourself):
- Tenant registry (create/fetch/plan-limits/active-check) — full Node test pass.
- Tenant-scoped API routing, including the 401/402 rejection paths and
  plan-limit enforcement (a trial tenant genuinely gets blocked from
  registering a 2nd target).
- Stripe webhook signature verification — tested with real HMAC-SHA256
  via the Web Crypto API: valid signatures accepted, wrong secret
  rejected, tampered payload rejected, missing header rejected.
- The full webhook handler — simulated a `checkout.session.completed`
  event with a self-computed valid signature and confirmed it correctly
  flips a tenant from `trial`/`trialing` to `pro`/`active`.

**Cannot be verified without your own Stripe account** (no Stripe
credentials exist in this environment):
- Actually creating a live Checkout Session against Stripe's real API
  (`checkout.js`'s `fetch()` call itself — the code path was written
  against Stripe's documented REST contract but not exercised against
  a real API key).
- The end-to-end "click upgrade → pay → webhook fires → plan activates"
  flow, which needs a real Stripe test-mode account.

## Setup

### 1. Cloudflare

```bash
cd apps/aether-cloud
npx wrangler kv namespace create AETHER_CLOUD_KV
# paste the returned id into wrangler.toml
npx wrangler pages deploy .
```

### 2. Stripe

1. Create a Stripe account (test mode is fine to start).
2. Create two recurring Prices: "Starter" ($49/mo) and "Pro" ($199/mo).
   Copy their price IDs (`price_...`).
3. Set secrets on the Pages project:
   ```bash
   wrangler pages secret put STRIPE_SECRET_KEY        # sk_test_... or sk_live_...
   wrangler pages secret put STRIPE_PRICE_ID_STARTER   # price_...
   wrangler pages secret put STRIPE_PRICE_ID_PRO       # price_...
   ```
4. In the Stripe dashboard, add a webhook endpoint pointing at
   `https://<your-pages-domain>/api/billing/webhook`, subscribed to:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret it gives you:
   ```bash
   wrangler pages secret put STRIPE_WEBHOOK_SECRET     # whsec_...
   ```
5. Redeploy so the new secrets take effect.

**Until `STRIPE_WEBHOOK_SECRET` is set, the webhook endpoint accepts
requests unverified** — deliberately not a hard fail, so you can wire the
happy path locally before Stripe is fully configured, but this means an
unconfigured deployment is silently insecure. Don't leave it that way in
production.

## Pricing model (encoded in `functions/api/tenants.js`)

| Plan | Max targets | Max protocol deploys | Price |
|---|---|---|---|
| Trial | 1 | 3 | Free, 7 days |
| Starter | 5 | Unlimited | $49/mo |
| Pro | 25 | Unlimited | $199/mo |
| Enterprise | Unlimited | Unlimited | Custom — point them at the self-hosted path + a support contract instead |

Limits are enforced server-side in `functions/api/[[path]].js`, not just
displayed on the pricing page — a trial tenant genuinely cannot register
a 2nd target or exceed 3 protocol deploys.

## API surface

Same routes as the free console (`GET /api/health`, `/api/fleet`,
`/api/workloads`, `/api/protocols`, `/api/policy`, etc.) — every request
additionally requires an `X-Aether-Api-Key` header. Plus commercial-only
routes:

```
POST /api/signup             — create a trial tenant, returns an API key
POST /api/billing/checkout   — create a Stripe Checkout Session
POST /api/billing/webhook    — Stripe webhook receiver (signature-verified)
```

## Known scale limit

The tenant registry is a single KV blob (`functions/api/tenants.js`),
read-modify-written on every signup and webhook. Fine for dozens-to-
low-hundreds of tenants. Past that, concurrent writes will start
clobbering each other — migrate to D1 or a Durable Object per tenant
before it matters, not after.
