# Deploying Weekly Command Center

This app is deploy-ready: multi-tenant auth, Alembic-migrated Postgres,
real Stripe billing, transactional email, an admin analytics dashboard, and
locked-down CORS are already in place. This document is the exact sequence
to take it from "runs on my machine" to a real, chargeable URL. No step here
has been run against a live host in this session — you'll need to
provide/own whichever account you deploy to.

For what's implemented and where, see:
- **COMMERCIAL.md** — billing flow, email templates, support/legal checklist
- **SERVICES.md** — service architecture, health checks, scaling
- **ALEMBIC.md** — migration workflow
- **SUPERCOMPUTER.md** — optional ML/distributed/GPU optimization mode
- **k8s/README.md** — Kubernetes manifests, if that's your target instead of Option A/B below

## 1. Generate real secrets

```sh
cp .env.example .env
openssl rand -hex 32   # paste into JWT_SECRET
openssl rand -hex 32   # paste into ADMIN_API_KEY (optional, gates /admin.html)
```

Set `POSTGRES_PASSWORD` to a long random value, and `CORS_ORIGINS` to the
exact origin your frontend will be served from (e.g. `https://app.yourco.com`
— no trailing slash, no wildcard).

Then fill in whichever of these you're ready to turn on (all are optional —
the app runs correctly with any subset unset, see §4):
- `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` — real payment processing
- `SENDGRID_API_KEY` (or the AWS SES / SMTP variables) — real outbound email
- `ADMIN_API_KEY` — enables `/admin.html`'s live MRR/usage/retention dashboard

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
7. In the Stripe Dashboard, point the webhook endpoint at
   `https://app.yourco.com/api/billing/webhook/stripe`.

### Option B — Fly.io / Render (managed containers + managed Postgres)

Both platforms can build directly from `docker-compose.prod.yml`-equivalent
service definitions (Fly: one `fly.toml` + `fly launch` per service, or a
single app with multiple processes; Render: "Blueprint" from a
`render.yaml`). The steps are the same in spirit:

1. Create a managed Postgres instance on the platform; use its connection
   string as `DATABASE_URL` (format: `postgresql+psycopg2://user:pass@host:5432/db`).
2. Deploy `core-api` (Dockerfile.prod) and `core-worker` (same image,
   command `python3 worker.py`) as two separate services/processes sharing
   the same `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `STRIPE_*`,
   `SENDGRID_*`/`SMTP_*`, `ADMIN_API_KEY` env vars — but only `core-api`
   needs `OPTIMIZER_URL`/`TASKRULES_URL`, and only `core-api` should have
   `ENABLE_INNER_AGENT=false` (core-worker runs the scheduler directly).
3. Deploy `optimizer-julia` and `taskrules-haskell` as internal-only services
   (no public port needed — `core-api` reaches them by service name).
4. Deploy `gateway-node` (Dockerfile.prod) as the one public-facing service,
   with `CORE_API_URL` pointing at `core-api`'s internal address. The
   platform's own TLS/CDN layer handles HTTPS.
5. Point your domain at whatever the platform gives you (a CNAME, usually).
6. In the Stripe Dashboard, point the webhook endpoint at
   `https://<your-domain>/api/billing/webhook/stripe`.

### Option C — Kubernetes (EKS/GKE/AKS/self-hosted)

Use this instead of A/B if you already run a cluster, or need autoscaling
beyond a single host. Full manifests, build script, and apply order are in
**[k8s/README.md](./k8s/README.md)** — same topology as
`docker-compose.prod.yml`, plus a `HorizontalPodAutoscaler` on `core-api`
and `gateway-node`, and an Alembic-migration `initContainer` that runs
exactly once per rollout regardless of replica count.

### Option D — Cloudflare Containers (edge deployment)

A different shape entirely: one container image bundling core-api +
Julia + Haskell as supervised sidecar processes, fronted by a Cloudflare
Worker. See **[CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)**.

## 3. First-run checklist

- [ ] Hit `https://<your-domain>/api/health` — expect `{"status":"ok"}`.
- [ ] Hit `https://<your-domain>/api/health/system` — confirm Julia/Haskell
      show `"healthy"` (or `"degraded"`/`"critical"` with Python fallbacks
      still serving correctly — see SERVICES.md).
- [ ] Sign up a real account through the UI, confirm the JWT persists across
      a page reload, and confirm a welcome email arrives (or shows up in
      `core-api` logs as a console-fallback send if no email provider is
      configured yet).
- [ ] Confirm `/api/billing/plan` shows the `free` plan and correct limits —
      this proves Postgres came up with the seeded plan rows
      (`billing.ensure_default_plans`, run automatically via `init_db()` on
      `core-api` startup, after Alembic migrations apply).
- [ ] If Stripe is configured: upgrade a test account to Pro with a
      [Stripe test card](https://docs.stripe.com/testing), confirm the
      webhook fires and `plan_id` flips, and confirm the upgrade-confirmation
      email sends.
- [ ] If `ADMIN_API_KEY` is set: open `/admin.html`, enter the key, confirm
      the overview tile shows your test account's MRR and plan distribution.
- [ ] Check `core-worker`'s logs for the three housekeeping job log lines
      (pressure recompute, week continuity, library scan) — confirms the
      scheduler is running exactly once, not once per gunicorn worker.
- [ ] Confirm `alembic current` (run inside the `core-api` container) shows
      the latest revision — proves migrations applied cleanly, not just
      that tables happen to exist.

## 4. What's real vs. what still needs your input

Everything below is fully implemented — none of it is a stub — but each
piece needs an external account or decision from you before it does
anything in production:

- **Billing (Stripe)** — `core-api/app/stripe_client.py` +
  `app/billing.py` create real Checkout Sessions and process real webhooks.
  Needs: a Stripe account, `stripe_price_id` set on each paid plan, and
  `STRIPE_API_KEY`/`STRIPE_WEBHOOK_SECRET` in your environment. Without
  these, `/billing/upgrade` still works but in test mode (flips the plan
  directly, no payment collected) — safe for staging, not for real revenue.
- **Email (SendGrid / SES / SMTP)** — `core-api/app/emails.py` auto-selects
  a provider from environment variables and sends real welcome/invite/
  billing emails. Needs: an account with one of the three providers. Without
  one, emails are logged instead of sent (visible in `core-api` logs) — the
  app never breaks a request over a failed or unconfigured send.
- **Admin analytics** — `/admin.html` + `core-api/app/analytics.py` compute
  real MRR/ARR/plan-distribution/retention from your actual data. Needs:
  `ADMIN_API_KEY` set (otherwise the endpoints return 503, not an insecure
  default-open state).
- **Database migrations** — Alembic (`core-api/alembic/`) replaces
  `create_all()`; `init_db()` runs `alembic upgrade head` on every startup.
  Needs: nothing further for a fresh deploy. When you change
  `app/db_models.py` later, run `alembic revision --autogenerate` and review
  the generated migration before merging — see ALEMBIC.md.
- **Backups & disaster recovery** — not automated by anything in this repo.
  Turn on your host/managed-Postgres provider's automated backups (most
  default to on, some don't) before storing real customer data, and test a
  restore once. See COMMERCIAL.md's Backups section for the specifics.
- **Legal (Privacy Policy / ToS / DPA)** — not generated by this app. See
  COMMERCIAL.md's Privacy & Legal section for tools (Iubenda, Termly) and
  what's actually required before charging customers.
