"""
Aether Platform REST router — transport-agnostic route dispatch.

Pure function `handle(method, path, body)` implementing the full route
table. Two transports call into this same logic:
  - server.py  — stdlib http.server, for self-hosted / Docker / systemd
  - worker.py  — Cloudflare Python Workers `on_fetch`, for edge deploys

Keeping the dispatch here (instead of duplicated in each transport's
handler) means both backends stay behaviorally identical by construction.

Routes:
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
  GET  /api/foundry/templates
  POST /api/foundry/generate
  POST /api/foundry/download
  POST /api/studio/generate    - new worker from a prompt
  POST /api/studio/configure   - recommend params for an existing template
  POST /api/studio/remix       - adapt an existing template into a new one
  POST /api/studio/download    - bundle a generate/remix spec into a zip
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any, Dict, Tuple

from aether_platform.fleet import (
    FleetManager, make_cloudflare_target, make_icp_target, TargetClass,
)
from aether_platform.orchestrator import OrchestrationEngine, Workload, WorkloadKind
from aether_platform.auth import PolicyEngine, Principal, Ring, Action
from aether_platform.deployer import DeployAgent, DeployExecutor

# Worker Foundry + Studio are lazy singletons — the Foundry reads its manifest
# once, the Studio holds no key. Import-guarded so the core API still boots even
# if these optional subsystems are absent.
try:
    from aether_platform.foundry import Foundry, FoundryError
    from aether_platform.studio import WorkerStudio, StudioError
    _FOUNDRY: "Foundry | None" = None
    _STUDIO: "WorkerStudio | None" = None
    _FOUNDRY_OK = True
except Exception:  # noqa: BLE001
    _FOUNDRY_OK = False


def _foundry() -> "Foundry":
    global _FOUNDRY
    if _FOUNDRY is None:
        _FOUNDRY = Foundry()
    return _FOUNDRY


def _studio() -> "WorkerStudio":
    global _STUDIO
    if _STUDIO is None:
        _STUDIO = WorkerStudio(foundry=_foundry())
    return _STUDIO


def build_platform() -> Tuple[FleetManager, OrchestrationEngine, PolicyEngine]:
    """
    Construct a fresh platform instance.

    Starts EMPTY by default — no fake targets — because this is a real
    system its operator uses directly; seeded demo fleets are worthless
    (worse: misleading) to someone running actual workloads. The three
    sample Cloudflare/ICP targets are opt-in via AETHER_SEED_DEMO=1, kept
    only so tests and first-look tours can populate a fleet on demand.
    """
    fleet  = FleetManager()
    engine = OrchestrationEngine(fleet)
    policy = PolicyEngine()

    if os.environ.get("AETHER_SEED_DEMO") == "1":
        fleet.register(make_cloudflare_target("Aether-Edge-1", "demo-account", "aether-edge-1"))
        fleet.register(make_cloudflare_target("Aether-Edge-2", "demo-account", "aether-edge-2"))
        fleet.register(make_icp_target("Aether-ICP-1", "rrkah-fqaaa-aaaaa-aaaaq-cai"))
        for t in fleet.targets:
            fleet.heartbeat(t.target_id, 12.0)

    # The operator principal is NOT demo data — without a sovereign
    # principal no one can authorize a deploy, so it's always present.
    policy.register_principal(Principal(
        principal_id="admin-001",
        name="Platform Admin",
        ring=Ring.SOVEREIGN,
        scopes=frozenset(),
    ))

    # Real deployment is opt-in: set AETHER_REAL_DEPLOY=1 to have tick()
    # actually run wrangler/dfx/aws (validate → deploy → verify → rollback)
    # via the DeployAgent. Left off by default so a tick is a safe no-op
    # dry run; flipping the flag makes deploys real (and honestly "staged"
    # where a CLI/credential is absent).
    if os.environ.get("AETHER_REAL_DEPLOY") == "1":
        engine.attach_deploy_agent(DeployAgent(
            executor=DeployExecutor(),
            rollback_fn=engine.rollback,
        ))

    return fleet, engine, policy


def handle(
    method: str, path: str, body: Dict[str, Any],
    fleet: FleetManager, engine: OrchestrationEngine, policy: PolicyEngine,
) -> Tuple[int, Any]:
    """
    Dispatch one request. Returns (status_code, response_body).
    `path` should already be stripped of query string.
    """
    p = path.rstrip("/") or "/"
    parts = p.strip("/").split("/")

    # ── GET routes ───────────────────────────────────────────────────────
    if method == "GET":
        if p == "/api/health":
            return 200, {
                "status": "sovereign",
                "beat": engine.snapshot()["beat"],
                "fleet_coherence": round(fleet.coherence(), 4),
                "ts": time.time(),
            }

        if p == "/api/fleet":
            return 200, fleet.snapshot()

        if len(parts) == 3 and parts[0] == "api" and parts[1] == "fleet":
            t = fleet.get(parts[2])
            return (200, t.to_dict()) if t else (404, {"error": "not_found"})

        if p == "/api/workloads":
            return 200, engine.snapshot()["workloads"]

        if p == "/api/platform":
            return 200, engine.snapshot()

        if p == "/api/policy":
            return 200, policy.snapshot()

        if p == "/api/policy/audit":
            return 200, policy.audit_log()

        if p == "/api/protocols":
            return 200, engine.list_available_protocols()

        if len(parts) == 3 and parts[0] == "api" and parts[1] == "protocols":
            status = engine.get_protocol_status(parts[2])
            return (200, status) if status else (404, {"error": "not_found"})

        # ── Worker Foundry (catalog) ─────────────────────────────────────
        if p == "/api/foundry/templates":
            if not _FOUNDRY_OK:
                return 503, {"error": "foundry_unavailable"}
            return 200, {"templates": _foundry().list_templates(),
                         "categories": _foundry().categories()}

        return 404, {"error": "not_found"}

    # ── POST routes ──────────────────────────────────────────────────────
    if method == "POST":
        if p == "/api/fleet/register":
            cls = body.get("class", "cloudflare_worker")
            if cls == "cloudflare_worker":
                t = make_cloudflare_target(
                    body.get("name", "unnamed"), body.get("account_id", ""), body.get("subdomain", ""),
                )
            elif cls == "icp_canister":
                t = make_icp_target(
                    body.get("name", "unnamed"), body.get("canister_id", ""), body.get("network", "ic"),
                )
            else:
                return 400, {"error": "unknown_class"}
            fleet.register(t)
            return 201, t.to_dict()

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "fleet" and parts[3] == "heartbeat":
            ok = fleet.heartbeat(parts[2], body.get("latency_ms", 0.0))
            return (200 if ok else 404), {"ok": ok}

        if p == "/api/fleet/tick":
            return 200, engine.tick(force=bool(body.get("force", False)))

        if p == "/api/workloads":
            try:
                kind = WorkloadKind(body.get("kind", "agent"))
                cls = TargetClass(body.get("target_class", "cloudflare_worker"))
            except ValueError as e:
                return 400, {"error": f"invalid_value: {e}"}
            w = Workload(
                workload_id=body.get("workload_id", f"wl-{int(time.time() * 1000)}"),
                name=body.get("name", "unnamed"),
                kind=kind,
                image_ref=body.get("image_ref", ""),
                target_class=cls,
                replicas=body.get("replicas", 1),
                env=body.get("env", {}),
                labels=body.get("labels", {}),
            )
            engine.register_workload(w)
            tick = engine.tick(force=bool(body.get("force", False)))
            return 201, {"workload": w.to_dict(), "deploy_result": tick}

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "workloads" and parts[3] == "rollback":
            ok = engine.rollback(parts[2])
            return (200 if ok else 404), {"ok": ok}

        if p == "/api/policy/evaluate":
            try:
                action = Action[body.get("action", "READ")]
            except KeyError:
                return 400, {"error": f"unknown_action: {body.get('action')}"}
            decision = policy.evaluate(body.get("principal_id", ""), action, body.get("scope"))
            return 200, decision.to_dict()

        if len(parts) == 4 and parts[0] == "api" and parts[1] == "protocols" and parts[3] == "deploy":
            protocol_id = parts[2]
            try:
                cls = TargetClass(body.get("target_class", "bare_metal"))
            except ValueError:
                return 400, {"error": f"unknown_target_class: {body.get('target_class')}"}
            w = engine.register_protocol(protocol_id, target_class=cls, replicas=body.get("replicas", 1))
            if w is None:
                return 404, {"error": f"protocol_not_found: {protocol_id}"}
            tick = engine.tick(force=bool(body.get("force", False)))
            return 201, {"workload": w.to_dict(), "deploy_result": tick}

        # ── Worker Foundry (generate + download) ─────────────────────────
        if p == "/api/foundry/generate":
            if not _FOUNDRY_OK:
                return 503, {"error": "foundry_unavailable"}
            try:
                rendered = _foundry().render(body.get("template_id", ""), body.get("params") or {})
                return 200, rendered
            except FoundryError as e:
                return 400, {"error": str(e)}

        if p == "/api/foundry/download":
            if not _FOUNDRY_OK:
                return 503, {"error": "foundry_unavailable"}
            try:
                blob = _foundry().bundle_zip(body.get("template_id", ""), body.get("params") or {})
                return 200, {"template_id": body.get("template_id", ""),
                             "filename": f"{body.get('template_id', 'worker')}.zip",
                             "zip_base64": base64.b64encode(blob).decode()}
            except FoundryError as e:
                return 400, {"error": str(e)}

        # ── Worker Studio (Claude builds a custom worker) ────────────────
        if p == "/api/studio/generate":
            if not _FOUNDRY_OK:
                return 503, {"error": "studio_unavailable"}
            try:
                spec = _studio().generate(
                    body.get("prompt", ""),
                    api_key=body.get("api_key"),
                    model=body.get("model"),
                )
                return 200, spec
            except StudioError as e:
                # 400 for a bad request (empty prompt); 402 when the operator
                # simply hasn't configured a key — the honest, actionable case.
                msg = str(e)
                code = 402 if msg.startswith("no_api_key") else 400
                return code, {"error": msg}

        # Recommends parameter values for an EXISTING template — "give me a
        # better configuration" / "help with one of the configurations".
        if p == "/api/studio/configure":
            if not _FOUNDRY_OK:
                return 503, {"error": "studio_unavailable"}
            try:
                result = _studio().configure(
                    body.get("template_id", ""),
                    body.get("goal", ""),
                    api_key=body.get("api_key"),
                    model=body.get("model"),
                )
                return 200, result
            except FoundryError as e:
                return 404, {"error": str(e)}
            except StudioError as e:
                msg = str(e)
                code = 402 if msg.startswith("no_api_key") else 400
                return code, {"error": msg}

        # Adapts an EXISTING template's real source into a new worker —
        # "take any of the forty and make a new one".
        if p == "/api/studio/remix":
            if not _FOUNDRY_OK:
                return 503, {"error": "studio_unavailable"}
            try:
                spec = _studio().remix(
                    body.get("template_id", ""),
                    body.get("request", ""),
                    api_key=body.get("api_key"),
                    model=body.get("model"),
                )
                return 200, spec
            except FoundryError as e:
                return 404, {"error": str(e)}
            except StudioError as e:
                msg = str(e)
                code = 402 if msg.startswith("no_api_key") else 400
                return code, {"error": msg}

        # Bundles a generate()/remix() spec into a real zip — worker file +
        # README + run.sh — the same shape a Foundry download gets.
        if p == "/api/studio/download":
            if not _FOUNDRY_OK:
                return 503, {"error": "studio_unavailable"}
            spec = body.get("spec") or {}
            if not spec.get("code") or not spec.get("filename"):
                return 400, {"error": "invalid_spec: spec.code and spec.filename are required"}
            blob = _studio().bundle_zip(spec)
            slug = (spec.get("filename", "worker").rsplit(".", 1)[0] or "worker")
            return 200, {"filename": f"{slug}.zip", "zip_base64": base64.b64encode(blob).decode()}

        return 404, {"error": "not_found"}

    return 405, {"error": "method_not_allowed"}
