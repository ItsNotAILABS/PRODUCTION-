"""
Aether Platform REST API — Cloudflare Python Workers transport.

Runs the same router.handle() dispatch as server.py, but as a Workers
`on_fetch` handler instead of a stdlib socket server, so the Python
backend can run natively on Cloudflare's edge (Pyodide-based Python
Workers runtime) rather than a VPS.

IMPORTANT — Python Workers is a comparatively new Cloudflare runtime.
This file is written to the documented on_fetch/Response contract as of
this writing, but has NOT been deploy-tested against a live Cloudflare
account (no account access from this environment) — unlike server.py and
the JS console, which were both run and verified directly. Test with
`wrangler dev` before relying on this in production, and expect to need
minor adjustments if Cloudflare's Python Workers API has moved since.

State: module-level FLEET/ENGINE/POLICY reset on every cold start (Workers
isolates are not guaranteed to persist between requests). For persistent
state, mirror the JS console's approach — read/write a JSON blob to a KV
namespace at the top and bottom of on_fetch — but note Pyodide's per-request
cold-start cost is much higher than the JS console's, so this Python Worker
is best suited to compute-heavy protocol logic, not high-frequency polling.
"""
from __future__ import annotations

import json

from workers import Response  # provided by the Cloudflare Python Workers runtime

from aether_platform.api.router import build_platform, handle

FLEET, ENGINE, POLICY = build_platform()

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _json_response(status: int, data) -> Response:
    return Response(
        json.dumps(data, indent=2),
        status=status,
        headers={"Content-Type": "application/json", **_CORS_HEADERS},
    )


async def on_fetch(request, env):
    if request.method == "OPTIONS":
        return Response("", status=204, headers=_CORS_HEADERS)

    url = request.url
    # request.url is an absolute URL in Workers; strip origin + query.
    path = url.split("://", 1)[-1].split("/", 1)[-1]
    path = "/" + path.split("?", 1)[0]

    body = {}
    if request.method == "POST":
        try:
            raw = await request.text()
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {}

    status, data = handle(request.method, path, body, FLEET, ENGINE, POLICY)
    return _json_response(status, data)
