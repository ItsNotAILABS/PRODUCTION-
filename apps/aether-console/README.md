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

## Deploy

### Option A — drag and drop (fastest)

1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
2. Upload this entire folder (or the zip you were given) as-is.
3. Cloudflare auto-detects `functions/api/[[path]].js` and wires it up — no build step needed.
4. Open the assigned `*.pages.dev` URL. The console boots with a seeded demo fleet (2 Cloudflare targets + 1 ICP canister).

### Option B — wrangler CLI

```bash
cd apps/aether-console
npx wrangler pages deploy .
```

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
