"""
Aether Compute Mesh — headless pull worker.
═══════════════════════════════════════════════════════════════════════

A persistent, headless compute node — the 24/7 desktop/server equivalent
of a browser tab that opens node.html. Where a browser node PULLS chunks
from the mesh coordinator and computes them in WebAssembly, this node
pulls the same chunks and computes them with the **native C++ engine**
(organism_native) — the fastest backend and the mesh's numerical anchor.

Two workers already exist; this fills the gap between them:

  * worker.py       — PUSH model. The coordinator posts a range to it.
                      Great for a fleet of known URLs.
  * browser/node.*  — PULL model, WASM. Any device that opens a page.
  * pull_worker.py  — PULL model, native. A box you own, left running,
    (this file)       that dials OUT to the mesh and grabs work. No inbound
                      port, no registration — just point it at the server
                      and it contributes cores until you stop it.

Because it dials out, it works from behind NAT / a laptop / a home server
with no public IP — exactly the machines that make a public mesh real.

Seeding convention (the one correctness subtlety): the native engine seeds
each population by LOCAL index, so a global range [begin, end) is computed
with seed = base_seed + begin. That makes every chunk's result identical to
the slice a single-machine batch_simulate of the whole job would produce —
so stitched results are bit-identical regardless of how the work was split.
(The browser/WASM kernel seeds by GLOBAL index, so it passes the plain job
seed instead. Same global answer, different parameterization — see
browser/node_worker.js.)

Run:
    python3 pull_worker.py --server http://coordinator-host:8900
    python3 pull_worker.py --server http://host:8900 --loops 2 --name shed-01

    # many nodes, one box (each dials out independently):
    for i in 1 2 3; do python3 pull_worker.py --server $URL --name box-$i & done
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.request

# Locate the native engine binding (organism/cpp/bindings/python).
_HERE = os.path.dirname(os.path.abspath(__file__))
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "cpp", "bindings", "python"))
if _BINDINGS not in sys.path:
    sys.path.insert(0, _BINDINGS)


def _load_engine():
    """Load the native engine, or exit with an honest, actionable message."""
    try:
        from organism_native import NativeEngine  # noqa: E402
        return NativeEngine()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(
            "[pull-worker] native engine unavailable: "
            f"{type(exc).__name__}: {exc}\n"
            "  This headless worker computes with the compiled C++ engine.\n"
            "  Build it first:  (cd organism/cpp && ./build.sh)  — or run a\n"
            "  browser node (organism/compute-mesh/browser/node.html), which\n"
            "  needs no toolchain because it ships a prebuilt WASM kernel.\n"
        )
        sys.exit(2)


class _HttpJson:
    """Tiny stdlib JSON-over-HTTP client with a per-request timeout."""

    def __init__(self, base: str, timeout: float):
        self.base = base.rstrip("/")
        self.timeout = timeout

    def post(self, path: str, payload: dict) -> dict:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            self.base + path, data=data,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read() or b"{}")

    def get(self, path: str) -> dict:
        req = urllib.request.Request(self.base + path, method="GET")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read() or b"{}")


class PullWorker:
    """One box contributing cores to a pull-based mesh coordinator."""

    def __init__(self, engine, server: str, name: str,
                 loops: int = 1, threads: int = -1,
                 idle_backoff: float = 0.6, error_backoff: float = 1.5,
                 http_timeout: float = 30.0):
        self.engine = engine
        self.http = _HttpJson(server, http_timeout)
        self.name = name
        self.loops = max(1, loops)
        # If several loops run at once, don't let each grab every core — that
        # just thrashes the scheduler. Split hardware threads across the loops.
        if threads is not None and threads > 0:
            self.threads = threads
        elif self.loops > 1:
            hw = getattr(engine, "hardware_threads", 0) or self.loops
            self.threads = max(1, hw // self.loops)
        else:
            self.threads = -1  # all hardware threads for the single loop
        self.idle_backoff = idle_backoff
        self.error_backoff = error_backoff
        self._stop = threading.Event()
        self._computed = 0            # populations computed (all loops)
        self._chunks = 0              # chunks completed
        self._lock = threading.Lock()
        self._t0 = time.time()

    def stop(self, *_a):
        self._stop.set()

    # ── one claim→compute→submit cycle ──────────────────────────────────
    def _one(self, node_id: str) -> str:
        """Returns 'did', 'idle', or 'error' — the caller paces on that."""
        try:
            chunk = self.http.post("/mesh/claim", {"node_id": node_id})
        except (urllib.error.URLError, TimeoutError, OSError):
            return "error"
        if not chunk or chunk.get("empty"):
            return "idle"

        begin = int(chunk["range_begin"])
        end = int(chunk["range_end"])
        count = end - begin
        if count <= 0:
            return "idle"

        coherences = self.engine.batch_simulate(
            population_count=count,
            nodes_per_population=int(chunk["nodes"]),
            steps=int(chunk["steps"]),
            coupling=float(chunk["coupling"]),
            dt=float(chunk["dt"]),
            seed=int(chunk["seed"]) + begin,   # ← native seeds by local index
            threads=self.threads,
        )
        try:
            self.http.post("/mesh/submit", {
                "job_id": chunk["job_id"], "chunk_id": chunk["chunk_id"],
                "node_id": node_id, "coherences": coherences,
            })
        except (urllib.error.URLError, TimeoutError, OSError):
            # Submit failed — the coordinator's lease will expire and the
            # chunk gets reissued. We simply drop it and claim again.
            return "error"

        with self._lock:
            self._computed += count
            self._chunks += 1
        return "did"

    def _loop(self, node_id: str):
        while not self._stop.is_set():
            outcome = self._one(node_id)
            if outcome == "idle":
                self._stop.wait(self.idle_backoff)
            elif outcome == "error":
                self._stop.wait(self.error_backoff)
            # 'did' → immediately claim the next chunk (no sleep)

    def _report(self):
        """Periodic one-line heartbeat to stdout, so `tail -f` shows life."""
        while not self._stop.is_set():
            self._stop.wait(5.0)
            if self._stop.is_set():
                break
            with self._lock:
                computed, chunks = self._computed, self._chunks
            elapsed = max(1e-6, time.time() - self._t0)
            rate = computed / elapsed
            sys.stdout.write(
                f"[pull-worker {self.name}] chunks={chunks} "
                f"populations={computed} rate={rate:,.0f} pop/s "
                f"({self.loops} loop(s), {self.threads} thr each)\n"
            )
            sys.stdout.flush()

    def run(self):
        # Confirm the coordinator is reachable before claiming to contribute.
        try:
            stats = self.http.get("/mesh/stats")
            reachable = f"reachable (jobs={stats.get('jobs', 0)})"
        except Exception as exc:  # noqa: BLE001
            reachable = f"NOT reachable yet ({type(exc).__name__}) — will keep retrying"
        hw = getattr(self.engine, "hardware_threads", "?")
        sys.stdout.write(
            f"[pull-worker {self.name}] joining {self.http.base} — "
            f"native engine, {hw} hw threads; coordinator {reachable}\n"
        )
        sys.stdout.flush()

        threads = []
        for i in range(self.loops):
            node_id = self.name if self.loops == 1 else f"{self.name}-L{i}"
            t = threading.Thread(target=self._loop, args=(node_id,), daemon=True)
            t.start()
            threads.append(t)
        reporter = threading.Thread(target=self._report, daemon=True)
        reporter.start()

        try:
            while not self._stop.is_set():
                self._stop.wait(0.5)
        finally:
            self._stop.set()
            for t in threads:
                t.join(timeout=2.0)
            with self._lock:
                sys.stdout.write(
                    f"[pull-worker {self.name}] stopped — "
                    f"{self._chunks} chunks, {self._computed} populations total\n"
                )


def main() -> None:
    ap = argparse.ArgumentParser(description="Headless native pull worker for the Aether compute mesh.")
    ap.add_argument("--server", default=os.environ.get("MESH_SERVER", "http://127.0.0.1:8900"),
                    help="mesh coordinator base URL (default $MESH_SERVER or http://127.0.0.1:8900)")
    ap.add_argument("--name", default=os.environ.get("MESH_NODE_ID", f"native-{os.getpid()}"),
                    help="node id reported to the coordinator")
    ap.add_argument("--loops", type=int, default=1,
                    help="concurrent claim loops (overlaps network I/O; splits cores across loops)")
    ap.add_argument("--threads", type=int, default=-1,
                    help="C++ threads per chunk (-1 = all hardware threads, split across loops)")
    ap.add_argument("--http-timeout", type=float, default=30.0)
    args = ap.parse_args()

    engine = _load_engine()
    worker = PullWorker(engine, args.server, args.name,
                        loops=args.loops, threads=args.threads,
                        http_timeout=args.http_timeout)
    signal.signal(signal.SIGINT, worker.stop)
    signal.signal(signal.SIGTERM, worker.stop)
    worker.run()


if __name__ == "__main__":
    main()
