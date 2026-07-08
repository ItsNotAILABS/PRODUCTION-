# Aether Sovereign Platform — Reference Documentation

The multi-substrate deployment orchestrator built to rival SUSE Rancher:
fleet management, workload orchestration, ring-based zero-trust RBAC, and
16 deployable intelligence protocols, delivered across four concrete
artifacts in this repo.

See also: [`research/aether-sovereign-paper.html`](../research/aether-sovereign-paper.html)
for the formal mathematical treatment (Kuramoto coherence gating, the
sovereignty ring hierarchy), and [`PROTOCOLS_MANIFEST.md`](../PROTOCOLS_MANIFEST.md)
for the full protocol catalog.

## The four artifacts

| Artifact | What it is | Where |
|---|---|---|
| Python reference backend | Fleet/orchestrator/policy/protocol logic, stdlib-only | `aether_platform/` |
| Cloudflare console | The user-facing dashboard (Fleet, Workloads, Protocols, Policy) | `apps/aether-console/` |
| Desktop app (Electron) | Same console UI, runs locally — no cloud account needed | `apps/aether-desktop/` |
| Protocol cores | 16 deployable intelligence units (finance, AI, infra, content, federation) | `protocols/` |

The console and the desktop app share one route implementation
(`apps/aether-console/functions/api/core.js`) — the desktop app's local
Node server and the Cloudflare Pages Function both `require`/`import` it
directly rather than duplicating the ~15 routes, so behavior can't drift
between "the web version" and "the app version."

## Core concepts

### Fleet coherence gate

Every registered deployment target (Cloudflare Worker, ICP canister,
Lambda function, bare metal) reports a heartbeat. Fleet coherence
`R = healthy_targets / total_targets` is checked every deploy cycle;
below `φ⁻¹ ≈ 0.618`, the deploy queue freezes automatically rather than
rolling out onto a degraded fleet. This replaces Rancher Fleet's
percentage-based rollout policy with a single threshold derived from the
golden ratio (the same constant used throughout this system's other
phi-weighted subsystems).

### Sovereignty rings (RBAC)

Eleven ordered privilege levels, `SOVEREIGN` (0, full authority) through
`INTERFACE` (10, read-only observer). A principal at ring *k* may perform
any action whose required ring is ≥ *k*:

```
SOVEREIGN(0) → SOVEREIGN_EDGE(1) → COGNITIVE(2) → NEURAL(3) → MEMORY(4)
  → ROUTE(5) → AFFECTIVE(6) → SOMATIC(7) → QUANTUM(8) → TEMPORAL(9) → INTERFACE(10)
```

This replaces Kubernetes' cluster-role + namespace role-binding matrix
with a one-dimensional comparison plus an optional scope-set check.

### Protocol-as-workload

Any of the 16 intelligence protocol cores (agent federation, task
orchestration, multimodal synthesis, finance signals, trading execution,
infra codegen, AI evaluation, website generation, sovereign federation,
workflow templating, trading signals, portfolio optimization, model
orchestration, architecture discovery, site analytics, content
generation) can be deployed through the identical pipeline as a
conventional Worker or canister — same coherence gate, same phi-weighted
target ranking.

## Deploying

### The console (Cloudflare Pages)

```bash
cd apps/aether-console
npx wrangler pages deploy .
```

Or drag-and-drop the contents via the Cloudflare dashboard
(Workers & Pages → Create → Pages → Upload assets). See
`apps/aether-console/README.md` for KV-binding setup (persists fleet
state across requests).

### The Python backend — self-hosted

```bash
cd aether_platform
docker compose up -d --build
```

Or systemd, for bare metal / a VPS without containers:

```bash
./aether_platform/deploy/deploy.sh you@your-server.example.com /opt/aether/PRODUCTION-
```

### The Python backend — Cloudflare Python Workers (edge)

```bash
cd aether_platform
npx wrangler dev      # verify locally first — see caveat in the README
npx wrangler deploy
```

Full detail, including the honest caveat on Python Workers deploy
verification status, is in `aether_platform/README.md`.

### The desktop app (Electron — no cloud account needed)

```bash
cd apps/aether-desktop
npm install
npm start
```

Runs the identical console UI and API locally; state persists to a JSON
file in the OS user-data directory instead of Cloudflare KV. Build an
installer with `npm run dist` (NSIS/portable on Windows, dmg on macOS,
AppImage on Linux). See `apps/aether-desktop/README.md` for verification
status — the local server was run and curl-tested directly; the Electron
GUI window itself needs verifying on a machine with a display.

## API surface (identical across all transports)

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

## Comparison to SUSE Rancher

| Rancher | Aether |
|---|---|
| Cluster | Target (Cloudflare Worker / ICP canister / Lambda / bare metal) |
| Fleet controller (% rollout) | Fleet coherence gate (Kuramoto `R ≥ φ⁻¹`) |
| Helm chart / app | Workload (agent, worker, canister, function, protocol, pipeline) |
| Cluster role + namespace binding | Sovereignty ring (single total order, 11 levels) |
| App Catalog | Protocol registry (16 deployable intelligence cores) |
| Requires Kubernetes | No Kubernetes — edge-native (Cloudflare) or bare metal |

## Verification status

Both the Docker/systemd self-hosted path and the JS Cloudflare console
have been run and curl-tested end-to-end against a live process — fleet
seeding, protocol deploy, workload rollback, policy evaluation, and the
designed error paths (bad target class → 400, unknown protocol → 404)
all verified. The Cloudflare Python Workers transport (`aether_platform/api/worker.py`)
is written to the documented runtime contract but has not been
deploy-verified against a live Cloudflare account — run `wrangler dev`
before relying on it in production.
