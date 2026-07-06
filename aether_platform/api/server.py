"""
Aether Platform REST API — sovereign control plane server.

Exposes the full platform surface over HTTP/JSON:
  GET  /api/fleet                  — fleet snapshot
  GET  /api/fleet/:id              — single target
  POST /api/fleet/register         — register a target
  POST /api/fleet/:id/heartbeat    — target heartbeat ping
  GET  /api/workloads              — all workloads
  POST /api/workloads              — create + enqueue workload
  POST /api/workloads/:id/rollback — roll back a workload
  GET  /api/policy                 — RBAC snapshot
  POST /api/policy/evaluate        — evaluate an access decision
  GET  /api/health                 — platform health

Zero external dependencies — standard library http.server only.
"""
from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from aether_platform.fleet import (
    FleetManager, make_cloudflare_target, make_icp_target,
    TargetClass,
)
from aether_platform.orchestrator import OrchestrationEngine, Workload, WorkloadKind
from aether_platform.auth import PolicyEngine, Principal, Ring, Action

PHI = 1.618033988749895


def _build_platform():
    fleet      = FleetManager()
    engine     = OrchestrationEngine(fleet)
    policy     = PolicyEngine()

    # Seed with demo targets
    fleet.register(make_cloudflare_target("Aether-Edge-1", "demo-account", "aether-edge-1"))
    fleet.register(make_cloudflare_target("Aether-Edge-2", "demo-account", "aether-edge-2"))
    fleet.register(make_icp_target("Aether-ICP-1", "rrkah-fqaaa-aaaaa-aaaaq-cai"))

    # Mark them healthy
    for t in fleet.targets:
        fleet.heartbeat(t.target_id, 12.0)

    # Seed with demo principal
    policy.register_principal(Principal(
        principal_id="admin-001",
        name="Platform Admin",
        ring=Ring.SOVEREIGN,
        scopes=frozenset(),
    ))

    return fleet, engine, policy


FLEET, ENGINE, POLICY = _build_platform()


def _json(data: Any) -> bytes:
    return json.dumps(data, indent=2).encode()


def _read_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length))


class PlatformHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def _send(self, code: int, data: Any) -> None:
        body = _json(data)
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        p = self.path.rstrip("/").split("?")[0]
        parts = p.strip("/").split("/")

        if p == "/api/health":
            self._send(200, {
                "status": "sovereign",
                "beat":   ENGINE.snapshot()["beat"],
                "fleet_coherence": round(FLEET.coherence(), 4),
                "ts":     time.time(),
            })

        elif p == "/api/fleet":
            self._send(200, FLEET.snapshot())

        elif len(parts) == 3 and parts[0] == "api" and parts[1] == "fleet":
            t = FLEET.get(parts[2])
            self._send(200 if t else 404, t.to_dict() if t else {"error": "not_found"})

        elif p == "/api/workloads":
            snap = ENGINE.snapshot()
            self._send(200, snap["workloads"])

        elif p == "/api/platform":
            self._send(200, ENGINE.snapshot())

        elif p == "/api/policy":
            self._send(200, POLICY.snapshot())

        elif p == "/api/policy/audit":
            self._send(200, POLICY.audit_log())

        elif p == "/api/protocols":
            self._send(200, ENGINE.list_available_protocols())

        elif len(parts) == 3 and parts[0] == "api" and parts[1] == "protocols":
            status = ENGINE.get_protocol_status(parts[2])
            self._send(200 if status else 404, status or {"error": "not_found"})

        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self):
        p = self.path.rstrip("/").split("?")[0]
        parts = p.strip("/").split("/")
        body  = _read_body(self)

        # POST /api/fleet/register
        if p == "/api/fleet/register":
            cls = body.get("class", "cloudflare_worker")
            if cls == "cloudflare_worker":
                t = make_cloudflare_target(
                    body.get("name", "unnamed"),
                    body.get("account_id", ""),
                    body.get("subdomain", ""),
                )
            elif cls == "icp_canister":
                t = make_icp_target(
                    body.get("name", "unnamed"),
                    body.get("canister_id", ""),
                    body.get("network", "ic"),
                )
            else:
                self._send(400, {"error": "unknown_class"})
                return
            FLEET.register(t)
            self._send(201, t.to_dict())

        # POST /api/fleet/:id/heartbeat
        elif len(parts) == 4 and parts[0] == "api" and parts[1] == "fleet" and parts[3] == "heartbeat":
            ok = FLEET.heartbeat(parts[2], body.get("latency_ms", 0.0))
            self._send(200 if ok else 404, {"ok": ok})

        # POST /api/workloads
        elif p == "/api/workloads":
            kind = WorkloadKind(body.get("kind", "agent"))
            cls  = TargetClass(body.get("target_class", "cloudflare_worker"))
            w = Workload(
                workload_id = body.get("workload_id", f"wl-{int(time.time()*1000)}"),
                name        = body.get("name", "unnamed"),
                kind        = kind,
                image_ref   = body.get("image_ref", ""),
                target_class= cls,
                replicas    = body.get("replicas", 1),
                env         = body.get("env", {}),
                labels      = body.get("labels", {}),
            )
            ENGINE.register_workload(w)
            tick = ENGINE.tick()
            self._send(201, {"workload": w.to_dict(), "deploy_result": tick})

        # POST /api/workloads/:id/rollback
        elif len(parts) == 4 and parts[0] == "api" and parts[1] == "workloads" and parts[3] == "rollback":
            ok = ENGINE.rollback(parts[2])
            self._send(200 if ok else 404, {"ok": ok})

        # POST /api/policy/evaluate
        elif p == "/api/policy/evaluate":
            decision = POLICY.evaluate(
                body.get("principal_id", ""),
                Action[body.get("action", "READ")],
                body.get("scope"),
            )
            self._send(200, decision.to_dict())

        # POST /api/fleet/tick (advance one deploy cycle)
        elif p == "/api/fleet/tick":
            result = ENGINE.tick()
            self._send(200, result)

        # POST /api/protocols/:id/deploy
        elif len(parts) == 4 and parts[0] == "api" and parts[1] == "protocols" and parts[3] == "deploy":
            protocol_id = parts[2]
            try:
                cls = TargetClass(body.get("target_class", "bare_metal"))
            except ValueError:
                self._send(400, {"error": f"unknown_target_class: {body.get('target_class')}"})
                return
            replicas = body.get("replicas", 1)
            w = ENGINE.register_protocol(protocol_id, target_class=cls, replicas=replicas)
            if w is None:
                self._send(404, {"error": f"protocol_not_found: {protocol_id}"})
            else:
                tick = ENGINE.tick()
                self._send(201, {"workload": w.to_dict(), "deploy_result": tick})

        else:
            self._send(404, {"error": "not_found"})


def run(host: str = "0.0.0.0", port: int = 7700) -> None:
    server = HTTPServer((host, port), PlatformHandler)
    print(f"Aether Platform API running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
