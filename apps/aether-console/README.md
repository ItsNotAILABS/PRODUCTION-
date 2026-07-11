# Aether Sovereign Console

The Rancher-rival control plane, running natively on Cloudflare Pages.

A single-page dashboard (`index.html`) backed by Cloudflare Pages Functions
(`functions/api/[[path]].js`) — a JS port of the platform's fleet manager,
orchestration engine, policy engine, and protocol registry
(`platform/{fleet,orchestrator,auth,protocols}` in the main repo), so the
whole control plane runs at the edge with zero servers to manage.

## What it replaces (Rancher equivalents)

| Rancher concept        | Aether equivalent                                   |
|-------------------------|------------------------------------------------------|
| Cluster                | Target (Cloudflare Worker, ICP canister, Lambda, bare metal) |
| Fleet controller        | Fleet page — phi-weighted target ranking + coherence gate |
| App / Helm chart        | Workload — agent, worker, canister, function, protocol, pipeline |
| Project / cluster RBAC  | Policy page — 11-ring sovereignty hierarchy (SOVEREIGN → INTERFACE) |
| App Catalog              | Protocols page — 16 deployable intelligence protocol cores |

Key differentiator: deploys are gated on **fleet coherence** (a Kuramoto
order parameter R across all registered targets). If R falls below
φ⁻¹ ≈ 0.618, the deploy queue freezes automatically — no partial rollout
onto an unhealthy fleet.

## Demo-free by design

This console starts **empty** — no fake targets. It's meant to be run by
its operator against a real fleet, so a seeded demo would just be noise you
have to delete before the tool is usable. You register your own targets and
they're the only thing you see.

If you specifically want a populated fleet for a first-look tour or a
screenshot, set `AETHER_SEED_DEMO=1` (or call `freshState(true)`): that
adds the three sample targets. It is off by default everywhere.

## Deploy

### Option 0 — run it for real, right now, no cloud account

The desktop server (`apps/aether-desktop/server.js`) is a real, usable,
zero-credential deployment — plain Node, local JSON persistence, the same
route core as the edge version:

```bash
cd apps/aether-desktop && node -e "require('./server.js').createServer('./aether-state.json', 7873)"
# open http://127.0.0.1:7873 — starts empty, register your real targets
```

State persists to `aether-state.json`, so your fleet survives restarts.
This is the recommended way to start using it today.

### Option A — Cloudflare Pages, drag and drop

1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
2. Upload this entire folder (or the zip you were given) as-is.
3. Cloudflare auto-detects `functions/api/[[path]].js` and wires it up — no build step needed.
4. Open the assigned `*.pages.dev` URL. The console boots **empty** (no demo fleet); add a KV binding below so your registered targets persist across requests.

### Option B — wrangler CLI

```bash
cd apps/aether-console
npx wrangler pages deploy .
```

Both cloud options need your own Cloudflare account (the `wrangler` login /
API token is yours — none is bundled here). Until a KV namespace is bound,
edge state resets per request; bind one (below) for real use.

### Persisting state (recommended)

Without a KV binding, state resets on every request — fine for a demo, not
for real use. To persist fleet/workload/policy state:

```bash
npx wrangler kv namespace create AETHER_KV
```

Then either:
- paste the returned `id` into `wrangler.toml` before running `wrangler pages deploy`, **or**
- in the Cloudflare dashboard: your Pages project → **Settings** → **Functions**
  → **KV namespace bindings** → add binding named `AETHER_KV` pointing at the
  namespace you created.

Redeploy (or trigger a new deployment) for the binding to take effect. The
console will show a banner on the Overview page if no binding is detected.

## API surface

All routes live under `/api/*`, served by the single catch-all function:

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
```

## Zero build step

No `npm install`, no bundler. `index.html` is plain HTML/CSS/canvas JS.
`functions/api/[[path]].js` is a single ES module using only the Cloudflare
Workers runtime's built-in `fetch`/`Request`/`Response` and the `env.AETHER_KV`
binding — no npm dependencies.

## Relationship to the Python platform

`platform/` in the main repo is the reference implementation (stdlib-only
Python, for local dev / non-Cloudflare targets). This console is a parallel
JS implementation of the same data model — same phi constants, same ring
hierarchy, same protocol registry — so behavior matches whichever backend
you point a client at.
