# Aether Sovereign Platform — Python backend

The reference implementation of the fleet manager, orchestration engine,
ring-based policy engine, and protocol registry. Zero pip dependencies —
stdlib only (`http.server`, `dataclasses`, `enum`).

> Renamed from `platform/` to `aether_platform/`: `platform` is a reserved
> Python stdlib module name, and the collision made this package
> unimportable in every invocation style. Nothing outside this directory
> referenced the old name, so the rename was a clean `git mv` + import fix.
> Route logic lives in `api/router.py` as a pure `handle()` function, shared
> byte-for-byte by both transports below — they can't drift apart.

## Run it locally

```bash
# from the repo root (the directory containing aether_platform/)
python3 -m aether_platform.api.server
# → Aether Platform API running on http://0.0.0.0:7700
```

## Two deployment paths

### Path 1 — Your own server (self-hosted, not a third-party PaaS)

Runs on hardware you control — a VPS, a home server, a rack in a colo —
matching the `bare_metal` target class already modeled in
`aether_platform/fleet/targets.py`.

**Docker (simplest):**

```bash
cd aether_platform
docker compose up -d --build
```

Serves on port 7700. Verified locally against the exact Docker
`WORKDIR`/`COPY` layout before shipping this. Put nginx/Caddy in front for
TLS (see `deploy/nginx.conf.example`).

**systemd (no containers):**

```bash
# On your server, once:
sudo useradd -r -s /usr/sbin/nologin aether
sudo mkdir -p /opt/aether && sudo chown aether:aether /opt/aether

# From your workstation, any time you want to deploy or redeploy:
./aether_platform/deploy/deploy.sh you@your-server.example.com /opt/aether/PRODUCTION-
```

Rsyncs the repo, installs `aether-platform.service`, restarts under
systemd with auto-restart. Check status directly on the server:

```bash
sudo systemctl status aether-platform
sudo journalctl -u aether-platform -f
```

TLS: the stdlib server has none by design (keeps it dependency-free). Put
nginx/Caddy in front — `deploy/nginx.conf.example` is a working starting
point; run `certbot --nginx` afterward for a free cert.

### Path 2 — Cloudflare Python Workers (edge-native)

Runs the *same* business logic (`fleet/`, `orchestrator/`, `auth/`,
`protocols/` — completely unchanged) at Cloudflare's edge, using their
Pyodide-based Python Workers runtime instead of a listening socket server.

```bash
cd aether_platform
npx wrangler dev       # test locally first
npx wrangler deploy    # then ship it
```

**Caveat, stated plainly:** Python Workers is a newer Cloudflare runtime.
`api/worker.py` is written to the documented `on_fetch`/`Response`
contract, but — unlike the Docker path and the JS console, both of which
were actually run and curl-tested during development — it has not been
deploy-verified against a live Cloudflare account (no account access from
this environment). Run `wrangler dev` and hit `/api/health` before trusting
it in production. State also resets on cold start unless you wire up a KV
binding (the commented-out block in `wrangler.toml` shows where; the JS
console's `functions/api/[[path]].js` is the pattern to copy).

### Picking between them

- Need it running *today*, want it battle-tested: **Path 1 (Docker/systemd)** —
  this is the one that was actually booted and curl-tested end-to-end.
- Want Python at the edge, no server to patch, willing to verify Workers
  compatibility yourself first: **Path 2**.
- Want zero-maintenance edge hosting with a proven runtime: use
  `apps/aether-console` (the JS port) instead — same API surface, already
  running on Cloudflare's mainline Workers runtime, not the newer Python one.

## API surface

Identical across all three: this backend (either transport) and
`apps/aether-console`'s JS backend expose the same routes, so a frontend
can point at whichever one you deployed.

```
GET  /api/health
GET  /api/fleet
GET  /api/fleet/:id
POST /api/fleet/register
POST /api/fleet/:id/heartbeat
POST /api/fleet/tick
GET  /api/workloads
POST /api/workloads
POST /api/workloads/:id/rollback
GET  /api/platform
GET  /api/policy
GET  /api/policy/audit
POST /api/policy/evaluate
GET  /api/protocols
GET  /api/protocols/:id
POST /api/protocols/:id/deploy

GET  /api/foundry/templates          — the 40-blueprint catalog (no key needed)
POST /api/foundry/generate           — render one blueprint's source (no key needed)
POST /api/foundry/download           — render + zip one blueprint (no key needed)

POST /api/studio/generate            — Claude writes a brand-new worker from a prompt
POST /api/studio/configure           — Claude recommends param values for an existing blueprint
POST /api/studio/remix               — Claude adapts an existing blueprint's real source into a new one
POST /api/studio/download            — zip a generate/remix result (worker + README + run.sh)
```

Every `/api/foundry/*` route needs nothing but the deployment itself — the
catalog and its 40 templates are static, checked-in files. The four
`/api/studio/*` routes are the AI layer: they call Claude, so they need
`ANTHROPIC_API_KEY` set on whichever backend you deployed (env var on
Docker/systemd, `wrangler secret put ANTHROPIC_API_KEY` on Cloudflare). With
no key set they return `402 no_api_key` and a clear message — they never
fabricate a worker.

**Curl examples** (against a local `python3 -m aether_platform.api.server`,
port 7700 — swap the base URL for wherever you deployed):

```bash
# Catalog — no key required
curl localhost:7700/api/foundry/templates | jq '.templates | length'   # -> 40

# Download a ready-made blueprint as a real, runnable zip
curl -s localhost:7700/api/foundry/download \
  -d '{"template_id":"web-spider","params":{"START_URL":"https://example.com","MAX_PAGES":"50"}}' \
  | jq -r '.zip_base64' | base64 -d > web-spider.zip

# Claude recommends parameter values for an existing blueprint
curl -s localhost:7700/api/studio/configure \
  -d '{"template_id":"price-tracker","goal":"watch our three competitors nightly"}' | jq

# Claude adapts an existing blueprint's real source into a new worker
curl -s localhost:7700/api/studio/remix \
  -d '{"template_id":"uptime-monitor","request":"also check TLS cert expiry per host"}' | jq

# Claude writes something entirely new
curl -s localhost:7700/api/studio/generate \
  -d '{"prompt":"a worker that logs into our dashboard, exports the CSV, uploads it hourly"}' | jq

# Bundle any generate/remix result into a real zip (worker + README + run.sh)
curl -s localhost:7700/api/studio/download -d '{"spec": <the JSON object from generate/remix above>}' \
  | jq -r '.zip_base64' | base64 -d > worker.zip
```

## Package layout

```
aether_platform/
  fleet/         — Target, TargetClass, FleetManager (Rancher's "cluster registry")
  orchestrator/  — Workload, OrchestrationEngine (Rancher's Fleet controller)
  auth/          — Ring, Principal, PolicyEngine (Rancher's RBAC)
  protocols/     — ProtocolRegistry — the 16 intelligence protocol cores as deployable workloads
  api/
    router.py    — transport-agnostic route dispatch (the single source of truth)
    server.py    — stdlib http.server transport (self-hosted)
    worker.py    — Cloudflare Python Workers transport (edge)
  Dockerfile, docker-compose.yml, deploy/  — self-hosted deployment (Path 1)
  wrangler.toml                            — Cloudflare Python Workers config (Path 2)
```
