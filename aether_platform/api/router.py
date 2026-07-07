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
"""
from __future__ import annotations

import time
from typing import Any, Dict, Tuple

from aether_platform.fleet import (
    FleetManager, make_cloudflare_target, make_icp_target, TargetClass,
)
from aether_platform.orchestrator import OrchestrationEngine, Workload, WorkloadKind
from aether_platform.auth import PolicyEngine, Principal, Ring, Action


def build_platform() -> Tuple[FleetManager, OrchestrationEngine, PolicyEngine]:
    """Construct a fresh platform instance, seeded with a demo fleet."""
    fleet  = FleetManager()
    engine = OrchestrationEngine(fleet)
    policy = PolicyEngine()

    fleet.register(make_cloudflare_target("Aether-Edge-1", "demo-account", "aether-edge-1"))
    fleet.register(make_cloudflare_target("Aether-Edge-2", "demo-account", "aether-edge-2"))
    fleet.register(make_icp_target("Aether-ICP-1", "rrkah-fqaaa-aaaaa-aaaaq-cai"))
    for t in fleet.targets:
        fleet.heartbeat(t.target_id, 12.0)

    policy.register_principal(Principal(
        principal_id="admin-001",
        name="Platform Admin",
        ring=Ring.SOVEREIGN,
        scopes=frozenset(),
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
            return 200, engine.tick()

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
            tick = engine.tick()
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
            tick = engine.tick()
            return 201, {"workload": w.to_dict(), "deploy_result": tick}

        return 404, {"error": "not_found"}

    return 405, {"error": "method_not_allowed"}
