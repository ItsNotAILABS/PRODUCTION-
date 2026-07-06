# Deploying to Cloudflare Containers

An alternative to `DEPLOY.md` (VPS / Fly.io / Render): this deploys the whole
app — core-api, the inner-agent worker, the Julia optimizer, and the Haskell
parser — as a single [Cloudflare Container](https://developers.cloudflare.com/containers/),
fronted by a Cloudflare Worker that also serves the static frontend directly
from Cloudflare's edge.

**What's verified vs. not**: every field in `cloudflare/wrangler.toml` and
`cloudflare/src/index.ts` was checked against the real `wrangler` (4.107.0)
and `@cloudflare/containers` (0.3.7) package sources pulled from npm — not
guessed — and `npx wrangler deploy --dry-run` successfully parses the config,
resolves both bindings (`WCC_CONTAINER`, `ASSETS`), and reads the static
assets. What's **not** verified: the actual container build and a live
deploy, since that needs a Docker daemon and an authenticated Cloudflare
account, neither of which were available where this was written. Treat this
as a strong first draft, not a guarantee — `wrangler dev` will tell you
quickly if anything's off.

## Why one container instead of four

Cloudflare Containers route through a Durable Object per container — a
container can't reach another container by hostname the way
`docker-compose` services can; only the Worker script (which holds the
bindings) can address a specific container. Rather than build a Worker that
mediates every internal call between four separate containers (core-api ↔
optimizer-julia ↔ taskrules-haskell), `cloudflare/Dockerfile` bundles all
three runtimes (Python, Julia, GHC-compiled Haskell) into **one** image,
running as sidecar processes under `supervisord`
(`cloudflare/supervisord/supervisord.conf`). core-api's existing
`OPTIMIZER_URL=http://127.0.0.1:8100` / `TASKRULES_URL=http://127.0.0.1:8200`
defaults then just work, unmodified — this is what "Julia and Haskell
embedded" means concretely here.

## Prerequisites

- A Cloudflare account with [Containers](https://developers.cloudflare.com/containers/) enabled (currently a paid-plan feature).
- Docker installed and running locally, or wherever you run `wrangler deploy` from — wrangler builds the image and pushes it to Cloudflare's registry for you.
- `wrangler login` completed (or a `CLOUDFLARE_API_TOKEN` in your environment for CI).
- **A managed Postgres instance reachable from the public internet** (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com), both have usable free tiers). This is not optional here the way it is on a VPS: a Cloudflare Container's local disk is not guaranteed to persist across restarts/redeploys, so the SQLite default (`run_local.sh`, `docker-compose.yml`) **cannot** be used for this path — `DATABASE_URL` must point at real external Postgres.

## Deploy

```sh
cd apps/weekly-command-center/cloudflare
npm install

wrangler secret put JWT_SECRET       # generate with: openssl rand -hex 32
wrangler secret put DATABASE_URL     # postgresql+psycopg2://user:pass@host:5432/db
wrangler secret put CORS_ORIGINS     # the exact origin this Worker will be served from

npm run deploy   # runs scripts/sync-assets.sh, then `wrangler deploy`
```

`scripts/sync-assets.sh` copies `../gateway-node/public/` into `cloudflare/public/`
before every dev/deploy so the Cloudflare frontend never drifts from the one
used by `run_local.sh`/Docker — there's exactly one copy of the UI source.

## First-run checklist

- [ ] `https://<your-worker>.workers.dev/api/health` → `{"status":"ok"}`.
- [ ] `https://<your-worker>.workers.dev/` loads the frontend from the Worker's assets binding.
- [ ] Sign up a real account; confirm `/api/billing/plan` shows the seeded `free` plan (proves Postgres came up with `billing.ensure_default_plans`, run on container startup).
- [ ] Check the container's logs (`wrangler tail`) for all four supervisord programs starting: `core-api`, `core-worker`, `optimizer-julia`, `taskrules-haskell`.
- [ ] Confirm a task-language quick-add and a week-optimize call both report `"engine": "haskell"` / `"engine": "julia"` (not `"python-fallback"`) — proves the sidecar processes are actually reachable on localhost, not silently falling back.

## Known limitations of this path vs. the VPS/Fly/Render path in DEPLOY.md

- **Single container instance.** `max_instances = 1` in `wrangler.toml` and the Worker always calls `getContainer(env.WCC_CONTAINER, "singleton")` — one container handles all traffic. The Worker + static assets scale infinitely on Cloudflare's edge, but the app container itself doesn't horizontally scale without further work (`getRandom()`/`loadBalance()` from `@cloudflare/containers` across multiple named instances, plus making core-api's own state fully external — it already is, since all state lives in Postgres, not on local disk).
- **No local persistence.** Anything written to the container's own filesystem (e.g. dropped `.eml` files for the email-context feature) does not survive a restart/redeploy. That feature works within a single container's lifetime but isn't durable here the way it is on a VPS with a real volume.
- **Billing is still a stub** here too — same caveat as `DEPLOY.md`.
- **No database migrations** — same caveat as `DEPLOY.md`; `create_all()` on startup is fine for a first deploy, not for schema changes after real customer data exists.
