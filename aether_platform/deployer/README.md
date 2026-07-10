# Aether deployer — real deployment + the agent that handles it

The orchestrator used to `_do_deploy(...) → return True` — a simulation.
This module makes it real: a `DeployExecutor` that runs the actual CLI for
each target class, and a `DeployAgent` that owns the whole lifecycle.

> Distinct from `aether_platform/deploy/`, which is host-provisioning
> (systemd/nginx/`deploy.sh` for standing up the platform itself). This is
> the runtime that ships *workloads* to *targets*.

## The agent lifecycle (all steps real)

```
validate → deploy → verify → rollback-on-fail
```

- **validate** — workload has an `image_ref`, target is alive.
- **deploy** — `DeployExecutor` runs the real command:
  `wrangler deploy` (Cloudflare), `dfx deploy` (ICP), `aws lambda ...`.
- **verify** — after a real push, HTTP-GET the target endpoint and require
  a 2xx. A deploy that "succeeded" but serves errors is a failed deploy.
- **rollback** — if verify fails, invoke the orchestrator's rollback so the
  fleet isn't left serving something broken.

## Honesty is a first-class outcome

Every deploy resolves to one of three states — never a faked success:

| outcome | meaning |
|---|---|
| `deployed` | tool present, credentials present, command succeeded, endpoint verified |
| `staged` | prepared but **not pushed** — the CLI or credential is missing. Reports exactly what's absent. The orchestrator requeues it (phase `STAGED`), so a later tick ships it once the infra appears. |
| `failed` | the tool ran and returned non-zero, or verification failed |

In this environment (no `wrangler`/`dfx`/`aws`, no cloud token) every real
deploy correctly **stages** and says why. Provide a token + the CLI and the
identical code path pushes for real.

## Turn it on

Real deployment is opt-in so the seeded demo keeps simulated-success:

```bash
export AETHER_REAL_DEPLOY=1        # attach the DeployAgent in build_platform()
export CLOUDFLARE_API_TOKEN=...    # + have `wrangler` on PATH, for Cloudflare
python3 -m aether_platform.api.server
```

With the flag off (default), `tick()` uses the old simulated stub.

## What's verified (`test_deployer.py`, 15 checks, all passing)

Run without any cloud credentials — because that's this environment's real
state — and all pass:

- executor **stages, never fakes**, when a tool/credential is missing, and
  names what's missing;
- the agent runs a **real HTTP health check** against a real local server
  (healthy → verified; 503 → verification fails);
- a failed verification triggers a **real rollback** (the rollback callback
  is actually invoked and recorded);
- validation rejects a workload with no `image_ref` before any deploy;
- orchestrator integration: a staged workload lands in `tick()`'s `staged`
  list (not `failed`), gets phase `STAGED`, and carries its deploy report.

```bash
python3 aether_platform/deployer/test_deployer.py
```

## What is NOT tested here

An actual `wrangler deploy` push to a live Cloudflare account — there's no
account or token in this environment. The command **construction**, the
tool/credential **detection**, and the whole **deployed → verify → rollback**
path *around* the push are tested (using a fake executor that returns a real
`deployed` outcome so the verify/rollback logic runs for real against a real
local endpoint). Flipping `AETHER_REAL_DEPLOY=1` with real credentials is
the one step that needs your cloud account to exercise end to end.
