---
name: aether-deploy
description: Use this skill when the user wants to deploy, ship, or stand up the Aether Sovereign Platform (or any one of its four artifacts — the Cloudflare console, the Electron desktop app, the Python backend, or a specific protocol) — the SUSE Rancher-rival control plane in this repo. Triggers on requests like "deploy the console", "ship the desktop app", "set up the backend on my server", "deploy this protocol", or "get Aether running".
---

# Deploying the Aether Sovereign Platform

Four independently deployable artifacts, all speaking the same 15-route
API. Full reference: `docs/aether-sovereign-platform.md`. Pick the path
that matches what the user actually asked for — don't do all four unless
they want all four.

## 1. The Console (Cloudflare Pages) — `apps/aether-console/`

The primary web UI: Overview, Fleet, Workloads, Protocols, Policy pages.
Zero build step.

```bash
cd apps/aether-console
npx wrangler pages deploy .
```

Or tell the user to drag-and-drop the folder via the Cloudflare dashboard
(Workers & Pages → Create → Pages → Upload assets) if they don't want to
use the CLI.

**Persistence matters here.** Without a KV binding, fleet/workload state
resets on every request. Before calling this "done," check whether the
user wants persistence:
- Create the namespace: `npx wrangler kv namespace create AETHER_KV`
- Bind it as `AETHER_KV` in `wrangler.toml` (already has the binding slot
  commented in) or via the Pages dashboard → Settings → Functions → KV
  namespace bindings.
- Redeploy after binding.

## 2. The Desktop App (Electron, no cloud account) — `apps/aether-desktop/`

For when the user wants something to just run locally with zero
deployment step.

```bash
cd apps/aether-desktop
npm install
npm start          # dev: opens the app window
npm run dist        # build an installer for the current platform
npm run dist:win    # or target a specific platform
npm run dist:mac
npm run dist:linux
```

State persists to a JSON file in the OS user-data directory automatically
— no configuration needed. Installers land in `dist/desktop-aether/`.

If `npm start` fails to open a window in a sandboxed/headless environment
(no display server), that's expected — verify the underlying logic
instead: `node server.js` equivalent via
`node -e "require('./server.js').createServer('/tmp/test.json', 7873)"`
then curl `http://127.0.0.1:7873/api/health`. Tell the user plainly if
you could only verify the server logic and not the GUI window itself —
don't claim the GUI was tested if it wasn't.

## 3. The Python Backend — `aether_platform/`

Two sub-paths depending on what the user means by "deploy the backend":

**Self-hosted (their own server, not a third-party PaaS) — the
well-verified path:**

```bash
# Docker
cd aether_platform
docker compose up -d --build

# systemd (bare metal / VPS, no containers)
./aether_platform/deploy/deploy.sh you@their-server.example.com /opt/aether/PRODUCTION-
```

**Cloudflare Python Workers (edge) — flag the caveat every time:**

```bash
cd aether_platform
npx wrangler dev      # verify locally FIRST
npx wrangler deploy
```

This transport (`aether_platform/api/worker.py`) has historically not
been deploy-tested against a live Cloudflare account in this
environment (no account access). Always tell the user to run
`wrangler dev` and hit `/api/health` themselves before trusting it in
production — don't imply it's been proven the way the Docker path has.

## 4. A Protocol (as a standalone deployable workload)

Protocols deploy through the platform's own API, not as separate
artifacts:

```bash
curl -X POST http://<backend-host>/api/protocols/PROTO-FED-001/deploy \
  -H 'Content-Type: application/json' \
  -d '{"target_class": "bare_metal", "replicas": 1}'
```

Valid `target_class` values: `cloudflare_worker`, `icp_canister`,
`lambda_function`, `edge_function`, `bare_metal`. List available
protocol IDs first with `GET /api/protocols` if the user doesn't know
the ID.

## Before declaring any deploy "done"

1. Actually run the command or the smoke test — don't just write the
   instructions and assume they work. `curl /api/health` after any
   backend/console deploy.
2. If you can't fully verify something in this environment (no
   Cloudflare account, no display server, no live systemd host), say so
   explicitly rather than reporting success. This has mattered
   concretely before — a "fixed" backend that was never actually run
   turned out to have three separate crash bugs.
3. Check `git status` / `git fetch origin <branch>` before pushing —
   this repo has hit push conflicts before when local state diverged
   from what was already on the remote.
