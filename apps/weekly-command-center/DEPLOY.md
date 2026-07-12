# Deploying Weekly Command Center

This app is deploy-ready: multi-tenant auth, a Postgres-backed production
stack, and locked-down CORS are already in place. This document is the exact
sequence to take it from "runs on my machine" to a real URL. No step here has
been run against a live host in this session — you'll need to provide/own
whichever account you deploy to.

## 1. Generate real secrets

```sh
cp .env.example .env
openssl rand -hex 32   # paste into JWT_SECRET
```

Set `POSTGRES_PASSWORD` to a long random value, and `CORS_ORIGINS` to the
exact origin your frontend will be served from (e.g. `https://app.yourco.com`
— no trailing slash, no wildcard).

## 2. Pick a host

### Option A — a VPS you control (DigitalOcean, Hetzner, etc.)

1. Provision a small VM (2 vCPU / 4GB RAM comfortably runs all five containers).
2. Install Docker + Docker Compose.
3. Clone this repo, `cd apps/weekly-command-center`, drop your `.env` in place.
4. Put a TLS-terminating reverse proxy in front of `gateway-node:3000` — the
   simplest option is [Caddy](https://caddyserver.com/), which gets you
   automatic Let's Encrypt certs from a two-line Caddyfile:
   ```
   app.yourco.com {
       reverse_proxy localhost:3000
   }
   ```
5. `docker compose -f docker-compose.prod.yml up -d --build`
6. Point your domain's A record at the VM's IP.

### Option B — Fly.io / Render (managed containers + managed Postgres)

Both platforms can build directly from `docker-compose.prod.yml`-equivalent
service definitions (Fly: one `fly.toml` + `fly launch` per service, or a
single app with multiple processes; Render: "Blueprint" from a
`render.yaml`). The steps are the same in spirit:

1. Create a managed Postgres instance on the platform; use its connection
   string as `DATABASE_URL` (format: `postgresql+psycopg2://user:pass@host:5432/db`).
2. Deploy `core-api` (Dockerfile.prod) and `core-worker` (same image,
   command `python3 worker.py`) as two separate services/processes sharing
   the same `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` env vars — but only
   `core-api` needs `OPTIMIZER_URL`/`TASKRULES_URL`, and only `core-api`
   should have `ENABLE_INNER_AGENT=false` (core-worker runs it directly).
3. Deploy `optimizer-julia` and `taskrules-haskell` as internal-only services
   (no public port needed — `core-api` reaches them by service name).
4. Deploy `gateway-node` (Dockerfile.prod) as the one public-facing service,
   with `CORE_API_URL` pointing at `core-api`'s internal address. The
   platform's own TLS/CDN layer handles HTTPS.
5. Point your domain at whatever the platform gives you (a CNAME, usually).

## 3. First-run checklist

- [ ] Hit `https://<your-domain>/api/health` — expect `{"status":"ok"}`.
- [ ] Sign up a real account through the UI, confirm the JWT persists across
      a page reload.
- [ ] Confirm `/api/billing/plan` shows the `free` plan and correct limits —
      this proves Postgres came up with the seeded plan rows
      (`billing.ensure_default_plans`, run automatically on `core-api` startup).
- [ ] Check `core-worker`'s logs for the three housekeeping job log lines
      (pressure recompute, week continuity, library scan) — confirms the
      scheduler is running exactly once, not once per gunicorn worker.

## 4. Known gaps to close before charging real customers

- **Billing is a stub.** `POST /billing/upgrade` flips `plan_id` with no
  payment collected. Wire a real Stripe integration in `core-api/app/billing.py`
  — create a Checkout Session for `plan.stripe_price_id`, and only flip the
  plan from the `checkout.session.completed` webhook, not from this endpoint
  directly. Also add a webhook endpoint for `customer.subscription.deleted`
  to downgrade on cancellation.
- **No database migrations.** Schema is created via
  `Base.metadata.create_all()` on startup — fine for this initial deploy, but
  any schema change after real customer data exists needs
  [Alembic](https://alembic.sqlalchemy.org/) migrations, not `create_all`.
- **No email delivery.** Signup/invite don't send verification or welcome
  emails yet. Add a transactional email provider (Postgres, SES, Resend,
  etc.) before relying on email-based flows (password reset isn't
  implemented at all yet).
- **Single-region, no backups configured.** Set up automated Postgres
  backups (most managed providers do this for you — confirm it's on)
  before storing real customer data.
