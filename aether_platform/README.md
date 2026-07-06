# Aether Sovereign Platform — Python backend

The reference implementation of the fleet manager, orchestration engine,
ring-based policy engine, and protocol registry. Zero pip dependencies —
stdlib only (`http.server`, `dataclasses`, `enum`).

> Renamed from `platform/` to `aether_platform/`: `platform` is a reserved
> Python stdlib module name, and the collision made this package
> unimportable in every invocation style. Nothing outside this directory
> referenced the old name, so the rename was a clean `git mv` + import fix.

## Run it locally

```bash
# from the repo root (the directory containing aether_platform/)
python3 -m aether_platform.api.server
# → Aether Platform API running on http://0.0.0.0:7700
```

## Self-hosted deployment (your own server, not a third-party PaaS)

This is designed to run on hardware you control — a VPS, a home server, a
rack in a colo — matching the `bare_metal` target class already modeled in
`aether_platform/fleet/targets.py`.

### Option 1 — Docker (simplest)

```bash
cd aether_platform
docker compose up -d --build
```

Serves on port 7700. Put nginx/Caddy in front for TLS (see
`deploy/nginx.conf.example`).

### Option 2 — systemd (no containers)

```bash
# On your server:
sudo useradd -r -s /usr/sbin/nologin aether   # if the user doesn't exist yet
sudo mkdir -p /opt/aether
sudo chown aether:aether /opt/aether

# From your workstation:
./aether_platform/deploy/deploy.sh you@your-server.example.com /opt/aether/PRODUCTION-
```

This rsyncs the repo, installs `aether-platform.service`, and starts it
under systemd with auto-restart. Re-run the same script any time you want
to push an update — it syncs + restarts in one shot.

Check status directly on the server:

```bash
sudo systemctl status aether-platform
sudo journalctl -u aether-platform -f
```

### TLS / reverse proxy

The stdlib server has no TLS support by design (keeps it dependency-free).
Put nginx or Caddy in front — `deploy/nginx.conf.example` is a working
starting point; run `certbot --nginx` afterward for a free cert.

## API surface

Identical route set to `apps/aether-console` (the Cloudflare-hosted JS
console) — point that console's frontend at this backend's URL instead of
its own KV-backed API if you want the Python side to own real state:

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

## Package layout

```
aether_platform/
  fleet/         — Target, TargetClass, FleetManager (Rancher's "cluster registry")
  orchestrator/  — Workload, OrchestrationEngine (Rancher's Fleet controller)
  auth/          — Ring, Principal, PolicyEngine (Rancher's RBAC)
  protocols/     — ProtocolRegistry — the 16 intelligence protocol cores as deployable workloads
  api/           — server.py, the stdlib HTTP entrypoint
  Dockerfile, docker-compose.yml, deploy/ — self-hosted deployment
```
