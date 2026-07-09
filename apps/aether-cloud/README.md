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
GET  /api/admin/stats        — operator-only, tenant count + credit liability
POST /api/billing/checkout   — dormant, needs Stripe configured
POST /api/billing/webhook    — dormant, needs Stripe configured
```

## Concurrency model (how it scales to many tenants)

Storage is **one KV key per tenant** (`tenant:<apiKey>`) and **one per
code** (`code:<code>`), not a shared registry blob. This is the multi-
user scaling property: two different tenants performing actions at the
same moment never touch the same KV key, so their writes can't clobber
each other. Cross-tenant contention is gone entirely — the system scales
to as many tenants as the KV namespace holds. Verified with a
`Promise.all` concurrent-spend test (two tenants debiting simultaneously,
both balances land correct).

Remaining honest caveat, precisely scoped: a **single** tenant firing
concurrent billable requests still read-modify-writes its own one key,
and KV has no compare-and-swap, so a tenant can still race *with itself*
— e.g. two simultaneous deploys might both read the same starting
balance. The blast radius is now one tenant's own credit balance, not the
whole registry. Same for the redeem-code `used` flag (a code could in
principle be redeemed twice under a deliberate simultaneous double-submit).
For true per-tenant write serialization, put each tenant behind a Durable
Object (they serialize writes per object) — that's the documented upgrade
path when a single tenant's concurrency becomes a real problem, which for
a deploy-console workload (human-paced clicks, not a firehose) is well
past launch.

The operator stats endpoint (`/api/admin/stats`) lists tenant keys to
aggregate counts and outstanding credit liability — O(tenant count), fine
for an operator overview at launch scale; swap for a running counter key
if tenant count reaches the thousands.
