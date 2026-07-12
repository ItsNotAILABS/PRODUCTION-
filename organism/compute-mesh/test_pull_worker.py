"""
End-to-end test of the headless native pull worker against the real
pull-based mesh coordinator (browser/mesh_server.py).

Spins up the REAL mesh_server.py (short chunk lease so the reclaim test is
quick), submits a batch job, then runs REAL PullWorker instances (native
C++ engine, dialing out over localhost HTTP — not mocks) that claim →
compute → submit until the queue drains. Proves:

  1. The queue drains and the job completes via headless native workers.
  2. The reassembled result is BIT-IDENTICAL to a single-machine
     batch_simulate of the whole job — the seed-offset + partition +
     reassembly are correct for the native (local-index-seeded) kernel.
  3. RESILIENCE: a worker that grabs a chunk then dies doesn't stall the
     job — its lease is reclaimed and the job still finishes, still
     bit-identical.

Requires the native library to be built first:
    cd organism/cpp && cmake -B build . && cmake --build build

Run:
    cd organism/compute-mesh && python3 test_pull_worker.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
_BROWSER = os.path.join(_HERE, "browser")
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "cpp", "bindings", "python"))
sys.path.insert(0, _BINDINGS)
sys.path.insert(0, _HERE)

from organism_native import NativeEngine  # noqa: E402
from pull_worker import PullWorker  # noqa: E402

PORT = 8936
BASE = f"http://127.0.0.1:{PORT}"


def _post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"{}")


def _get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.loads(r.read() or b"{}")


def _wait_server(timeout=8.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            _get("/mesh/stats")
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.15)
    return False


def run():
    try:
        engine = NativeEngine()
    except FileNotFoundError as e:
        print(f"SKIP: native library not built — {e}")
        raise SystemExit(0)

    failures = []

    def check(label, cond, detail=""):
        print(("PASS" if cond else "FAIL") + f": {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    srv = subprocess.Popen(
        [sys.executable, os.path.join(_BROWSER, "mesh_server.py"), "--port", str(PORT)],
        env={**os.environ, "MESH_CHUNK_LEASE_SECONDS": "2"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not _wait_server():
            print("SKIP: mesh_server did not start")
            srv.terminate()
            raise SystemExit(0)

        spec = dict(population_count=500, nodes=128, steps=18,
                    coupling=0.35, dt=0.873, seed=4242, chunk_size=37)

        # ── Job 1: normal drain across several headless native workers ──
        created = _post("/mesh/job", spec)
        check("job created with >1 chunk", bool(created.get("job_id")) and created.get("chunks", 0) > 1,
              json.dumps(created))

        workers = [PullWorker(engine, BASE, f"native-w{i}", loops=1, threads=1,
                              idle_backoff=0.05, error_backoff=0.1)
                   for i in range(4)]
        wthreads = [threading.Thread(target=w.run, daemon=True) for w in workers]
        for t in wthreads:
            t.start()

        status = {}
        for _ in range(400):
            status = _get("/mesh/job/" + created["job_id"])
            if status.get("complete"):
                break
            time.sleep(0.05)
        for w in workers:
            w.stop()
        check("job completed by headless native pull-workers", status.get("complete") is True,
              json.dumps({"done": status.get("done"), "chunks": status.get("chunks")}))

        ref = engine.batch_simulate(
            population_count=spec["population_count"], nodes_per_population=spec["nodes"],
            steps=spec["steps"], coupling=spec["coupling"], dt=spec["dt"],
            seed=spec["seed"], threads=1)
        check("reassembled result bit-identical to single-machine native batch",
              status.get("result") == ref,
              f"lengths {len(status.get('result') or [])} vs {len(ref)}")

        # ── Job 2: lease reclaim — a worker grabs one chunk then dies ───
        job2 = _post("/mesh/job", {**spec, "seed": 777})

        # A worker that claims exactly one chunk, never submits, then vanishes.
        flaky = PullWorker(engine, BASE, "flaky", loops=1, threads=1)
        one = flaky._one("flaky")  # claim + compute + submit ONE... but we want it to NOT submit
        # _one already submitted; to simulate a true drop, claim raw and abandon:
        dropped = _post("/mesh/claim", {"node_id": "ghost"})
        check("ghost worker claimed a chunk then vanished (no submit)", not dropped.get("empty"),
              json.dumps(dropped))

        good = [PullWorker(engine, BASE, f"good{i}", loops=1, threads=1,
                           idle_backoff=0.05, error_backoff=0.1) for i in range(4)]
        gthreads = [threading.Thread(target=g.run, daemon=True) for g in good]
        for t in gthreads:
            t.start()

        s2 = {}
        for _ in range(600):
            s2 = _get("/mesh/job/" + job2["job_id"])
            if s2.get("complete"):
                break
            time.sleep(0.05)
        for g in good:
            g.stop()
        check("job completes despite a worker vanishing mid-chunk (lease reclaimed)",
              s2.get("complete") is True,
              json.dumps({"done": s2.get("done"), "chunks": s2.get("chunks")}))
        ref2 = engine.batch_simulate(
            population_count=spec["population_count"], nodes_per_population=spec["nodes"],
            steps=spec["steps"], coupling=spec["coupling"], dt=spec["dt"],
            seed=777, threads=1)
        check("reclaimed-job result still bit-identical", s2.get("result") == ref2)

    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:  # noqa: BLE001
            srv.kill()

    print()
    if failures:
        print(f"RESULT: {len(failures)} FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: headless native pull workers join the mesh, drain the queue to a "
          "bit-identical result, and a vanished worker's chunk is reclaimed so the job "
          "always finishes.")


if __name__ == "__main__":
    run()
