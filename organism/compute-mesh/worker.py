"""
Aether Compute Mesh — worker node.
═══════════════════════════════════════════════════════════════════════

A single compute node in the distributed mesh. Computes an assigned
GLOBAL population range of a batch Kuramoto job using the native C++
engine (organism_native) and returns the coherences for that range.

The key correctness property: a worker handed global range [begin, end)
calls the native engine with seed = base_seed + begin, so its local
population indices 0..(end-begin) map to the same per-population seeds
(base_seed + global_index) the monolithic single-node run would use.
That makes the stitched-together distributed result BIT-IDENTICAL to a
single-machine batch_simulate of the whole range — verified in
test_mesh.py, and the reason distribution here is a pure speed/scale win
with no change to the answer.

Stdlib http.server only — same zero-dependency posture as the rest of the
platform. This process IS a fleet node: run one per machine (or many per
machine on different ports), point the coordinator at their URLs.

Run:
    python3 worker.py --port 8801
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

# Locate the native engine binding (organism/cpp/bindings/python).
_HERE = os.path.dirname(os.path.abspath(__file__))
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "cpp", "bindings", "python"))
if _BINDINGS not in sys.path:
    sys.path.insert(0, _BINDINGS)

from organism_native import NativeEngine  # noqa: E402

_ENGINE = NativeEngine()
_NODE_ID = os.environ.get("MESH_NODE_ID", f"node-{os.getpid()}")


def compute_range(spec: dict) -> dict:
    """Compute one global population range. `spec` fields:
    range_begin, range_end, nodes, steps, coupling, dt, seed."""
    begin = int(spec["range_begin"])
    end = int(spec["range_end"])
    count = end - begin
    if count <= 0:
        return {"node": _NODE_ID, "range_begin": begin, "range_end": end, "coherences": []}

    coherences = _ENGINE.batch_simulate(
        population_count=count,
        nodes_per_population=int(spec["nodes"]),
        steps=int(spec["steps"]),
        coupling=float(spec["coupling"]),
        dt=float(spec["dt"]),
        seed=int(spec["seed"]) + begin,   # ← the global-seed offset
        threads=int(spec.get("threads", -1)),
    )
    return {
        "node": _NODE_ID,
        "range_begin": begin,
        "range_end": end,
        "coherences": coherences,
        "hardware_threads": _ENGINE.hardware_threads,
    }


class WorkerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _send(self, code: int, data) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/health":
            self._send(200, {"node": _NODE_ID, "status": "ready",
                             "hardware_threads": _ENGINE.hardware_threads})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self):
        if urlsplit(self.path).path != "/compute/batch":
            self._send(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            spec = json.loads(self.rfile.read(length)) if length else {}
            self._send(200, compute_range(spec))
        except Exception as e:  # noqa: BLE001 — report any compute error to the coordinator
            self._send(500, {"node": _NODE_ID, "error": str(e)})


def run(host: str = "127.0.0.1", port: int = 8801) -> None:
    server = HTTPServer((host, port), WorkerHandler)
    print(f"[mesh-worker {_NODE_ID}] listening on http://{host}:{port} "
          f"({_ENGINE.hardware_threads} local threads)")
    server.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8801)
    args = ap.parse_args()
    run(args.host, args.port)
