# Aether Cloud

The commercial, multi-tenant edition of the Aether Sovereign Console,
monetized with an **internal credit economy** — not live payment
processing. Kept as a **separate app from `apps/aether-console`** on
purpose: the free console's whole pitch is "you own your infra, deploy
it to your own Cloudflare account"; bolting billing onto that would
contradict the pitch. Aether Cloud is the opposite model: you (the
operator) run this, customers sign up and get an API key with free
credits, and billable actions spend those credits.

Both apps share the same core route logic
(`apps/aether-console/functions/api/core.js` — imported here, not
forked) so a fleet/workload/protocol/policy call behaves identically
whether it's free-and-self-hosted or managed. What's unique to this app
is the commercial layer: signup, API keys, per-tenant state isolation,
and credit-cost enforcement.

## How billing works right now

No Stripe, no card required, nothing external to configure to get the
whole product working end-to-end today:

- Every signup gets **500 free credits**.
- Billable actions cost credits, deducted only after the action
  succeeds: registering a target (50), deploying a protocol (100),
  deploying a workload (75). Reads (fleet status, policy, etc.) are free.
- Run out? The operator (you) mints a **redemption code** for any amount
  of credits and hands it out however you like — email, Discord, an
  invoice, a Zapier automation later. The customer redeems it from the
  console sidebar.
- This is a real, working mechanic, not a stub: see the verification
  section below.

Stripe wiring (`functions/api/billing/checkout.js`,
`functions/api/billing/webhook.js`, and the Stripe-linkage functions in
`tenants.js`) is **left in place but dormant** — not deleted. Re-enabling
real payment processing later means restoring a credit-cost check to
also accept a paid-plan flag; it doesn't mean rebuilding this app. See
each file's docstring for exactly what's needed (a Stripe account, price
IDs, a webhook secret) whenever that's the priority again.

## What's actually verified

Every claim below was tested against the real code, not assumed:

- **Full signup → spend → exhaust → redeem cycle**, run end-to-end with
  a Node test harness: signup grants exactly 500 credits; registering a
  target deducts exactly 50; deploying a protocol deducts exactly 100;
  deploying a workload deducts exactly 75; free reads (`GET /api/fleet`)
  deduct nothing; draining the balance to 0 correctly blocks the next
  billable action with `402 insufficient_credits`; an admin-generated
  redemption code correctly adds its value to the balance; redeeming the
  same code twice correctly fails with `409 code_already_used`; a wrong
  admin secret on the code-generation endpoint correctly gets `403`; an
  invalid API key correctly gets `401` on every route.
- **A real bug found and fixed via this testing**: the shared
  `freshState()` used to unconditionally seed 3 demo targets, which
  meant a fresh tenant (register limit was 1, in the old plan-based
  design) started already over their own limit. Fixed with an opt-in
  `seedDemo` parameter — the free console and desktop app are unaffected
  (still seed 3 demo targets, re-verified), Aether Cloud tenants now
  start genuinely empty.
- Stripe webhook signature verification (dormant but tested anyway, since
  it's cheap to keep correct): real HMAC-SHA256 via Web Crypto — valid
  signatures accepted, wrong secret/tampered payload/missing header all
  correctly rejected.

**Not verified** (would need a live Stripe account, out of scope while
billing runs on credits): the actual `fetch()` call to Stripe's REST API
in `checkout.js`, and the true click-to-pay flow.

## Setup

```bash
cd apps/aether-cloud
npx wrangler kv namespace create AETHER_CLOUD_KV
# paste the returned id into wrangler.toml
wrangler pages secret put AETHER_CLOUD_ADMIN_SECRET   # any long random string you choose — this is yours, not a Stripe credential
npx wrangler pages deploy .
```

That's it — no external accounts needed to run the whole product. To
give a customer more credits after signup:

```bash
curl -X POST https://<your-domain>/api/credits/generate \
  -H "X-Admin-Secret: <the secret you set above>" \
  -H "Content-Type: application/json" \
  -d '{"credits": 2000}'
# → { "code": "AETH-XXXX-XXXX-XXXX-XXXX", "credits": 2000 }
```

Send them the code; they redeem it from the console sidebar ("Redeem
code") or via `POST /api/credits/redeem` directly.

## API surface

Same routes as the free console (`GET /api/health`, `/api/fleet`,
`/api/workloads`, `/api/protocols`, `/api/policy`, etc.) — every request
additionally requires an `X-Aether-Api-Key` header. Plus:

```
POST /api/signup             — create a tenant, 500 free credits, returns an API key
GET  /api/account            — current tenant's email/plan/credit balance
POST /api/credits/redeem     — redeem a code for credits
POST /api/credits/generate   — operator-only (X-Admin-Secret), mint a code
POST /api/billing/checkout   — dormant, needs Stripe configured
POST /api/billing/webhook    — dormant, needs Stripe configured
```

## Known scale limit

The tenant registry and the redemption-code registry are each a single
KV blob, read-modify-written on every signup/spend/redemption. Fine for
dozens-to-low-hundreds of tenants. Past that, concurrent writes will
start clobbering each other — migrate to D1 or a Durable Object per
tenant before it matters, not after.
