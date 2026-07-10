"""
Pull-based mesh coordinator — the work queue browser nodes join.
═══════════════════════════════════════════════════════════════════════

Push-based dispatch (coordinator.py) works for known worker URLs, but a
browser can't be pushed to — a phone that opens a page must PULL work.
This server is that queue: it holds a batch job, hands out chunks to
whoever asks, and reassembles the results as they come back. Volunteer
nodes (browser tabs) come and go freely; a chunk leased to a node that
vanishes is reclaimed after a timeout and handed to someone else, so the
job always completes.

Endpoints:
  POST /mesh/job          create a job → { job_id }
  POST /mesh/claim        { node_id } → a chunk to compute, or { empty:true }
  POST /mesh/submit       { job_id, chunk_id, node_id, coherences } → ack
  GET  /mesh/job/<id>     job status (+ result once complete)
  GET  /mesh/stats        live node + throughput overview
  GET  /                  serves node.html (open this on a phone to join)
  GET  /<file>            serves the static node assets (kernel.wasm, etc.)

Stdlib http.server only. Chunk computation is the SAME global-range /
seed-offset convention as worker.py, so browser (WASM/JS) results stitch
consistently and agree with the native engine within float tolerance.

Run:
    python3 mesh_server.py --port 8900
    # then open http://<this-host>:8900/ on any device to contribute cores
"""
from __future__ import annotations

import argparse
import json
import os
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

_HERE = os.path.dirname(os.path.abspath(__file__))

# Static files this server will serve (the browser node bundle).
_STATIC_ALLOW = {
    "node.html", "node_worker.js", "mesh_kernel.js", "wasm_runner.js", "kernel.wasm",
}
_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
}

# Reclaim a chunk if its node goes silent this long. Overridable for tests.
CHUNK_LEASE_SECONDS = float(os.environ.get("MESH_CHUNK_LEASE_SECONDS", "30"))


class Job:
    def __init__(self, spec: dict):
        self.id = "job-" + uuid.uuid4().hex[:12]
        self.nodes = int(spec.get("nodes", 256))
        self.steps = int(spec.get("steps", 20))
        self.coupling = float(spec.get("coupling", 0.35))
        self.dt = float(spec.get("dt", 0.873))
        self.seed = int(spec.get("seed", 1))
        self.total = int(spec.get("population_count", 1000))
        chunk = int(spec.get("chunk_size", 64))
        self.created_at = time.time()

        # Build chunks over [0, total).
        self._chunks: dict[int, dict] = {}
        cid = 0
        begin = 0
        while begin < self.total:
            end = min(begin + chunk, self.total)
            self._chunks[cid] = {
                "chunk_id": cid, "range_begin": begin, "range_end": end,
                "state": "pending", "lease_ts": 0.0, "node": None, "result": None,
            }
            begin = end
            cid += 1

        self.results: list = [None] * self.total
        self._lock = threading.Lock()

    def claim(self, node_id: str):
        now = time.time()
        with self._lock:
            # Reclaim expired leases first.
            for c in self._chunks.values():
                if c["state"] == "in_flight" and now - c["lease_ts"] > CHUNK_LEASE_SECONDS:
                    c["state"] = "pending"; c["node"] = None
            # Hand out the lowest pending chunk.
            for c in self._chunks.values():
                if c["state"] == "pending":
                    c["state"] = "in_flight"; c["lease_ts"] = now; c["node"] = node_id
                    return {
                        "job_id": self.id, "chunk_id": c["chunk_id"],
                        "range_begin": c["range_begin"], "range_end": c["range_end"],
                        "nodes": self.nodes, "steps": self.steps,
                        "coupling": self.coupling, "dt": self.dt, "seed": self.seed,
                    }
            return None

    def submit(self, chunk_id: int, node_id: str, coherences: list) -> bool:
        with self._lock:
            c = self._chunks.get(chunk_id)
            if not c or c["state"] == "done":
                return False  # unknown or already-completed (late/duplicate) chunk
            begin, end = c["range_begin"], c["range_end"]
            if len(coherences) != end - begin:
                return False
            self.results[begin:end] = coherences
            c["state"] = "done"; c["result"] = True
            return True

    def status(self) -> dict:
        with self._lock:
            states = {"pending": 0, "in_flight": 0, "done": 0}
            for c in self._chunks.values():
                states[c["state"]] += 1
            done = states["done"] == len(self._chunks)
            return {
                "job_id": self.id, "total": self.total,
                "chunks": len(self._chunks), **states, "complete": done,
                "result": self.results if done else None,
            }


class MeshState:
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        self.nodes: dict[str, float] = {}   # node_id → last_seen
        self._lock = threading.Lock()

    def create_job(self, spec: dict) -> Job:
        job = Job(spec)
        with self._lock:
            self.jobs[job.id] = job
        return job

    def touch(self, node_id: str):
        with self._lock:
            self.nodes[node_id] = time.time()

    def claim_any(self, node_id: str):
        self.touch(node_id)
        # Oldest job first, so jobs drain in order.
        for job in list(self.jobs.values()):
            chunk = job.claim(node_id)
            if chunk:
                return chunk
        return None

    def stats(self) -> dict:
        now = time.time()
        with self._lock:
            active = sum(1 for t in self.nodes.values() if now - t < 60)
            return {
                "jobs": len(self.jobs),
                "nodes_seen": len(self.nodes),
                "nodes_active_1m": active,
            }


STATE = MeshState()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, data, ctype="application/json"):
        body = data if isinstance(data, (bytes, bytearray)) else json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/mesh/stats":
            self._send(200, STATE.stats()); return
        if path.startswith("/mesh/job/"):
            jid = path.rsplit("/", 1)[-1]
            job = STATE.jobs.get(jid)
            self._send(200 if job else 404, job.status() if job else {"error": "not_found"})
            return
        # static files
        name = "node.html" if path == "/" else path.lstrip("/")
        if name in _STATIC_ALLOW:
            fp = os.path.join(_HERE, name)
            if os.path.isfile(fp):
                ext = os.path.splitext(name)[1]
                with open(fp, "rb") as f:
                    self._send(200, f.read(), _MIME.get(ext, "application/octet-stream"))
                return
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        body = self._body()
        if path == "/mesh/job":
            job = STATE.create_job(body)
            self._send(201, {"job_id": job.id, "chunks": len(job._chunks), "total": job.total})
        elif path == "/mesh/claim":
            chunk = STATE.claim_any(body.get("node_id", "anon"))
            self._send(200, chunk if chunk else {"empty": True})
        elif path == "/mesh/submit":
            job = STATE.jobs.get(body.get("job_id", ""))
            if not job:
                self._send(404, {"ok": False, "error": "unknown_job"}); return
            STATE.touch(body.get("node_id", "anon"))
            ok = job.submit(int(body.get("chunk_id", -1)), body.get("node_id", "anon"),
                            body.get("coherences", []))
            self._send(200, {"ok": ok})
        else:
            self._send(404, {"error": "not_found"})


def run(host="0.0.0.0", port=8900):
    srv = ThreadingHTTPServer((host, port), Handler)
    print(f"[mesh-server] http://{host}:{port}  — open / on any device to contribute cores")
    srv.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8900)
    a = ap.parse_args()
    run(a.host, a.port)
