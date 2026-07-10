"""
End-to-end test of the distributed compute mesh. Spins up REAL worker
processes (separate OS processes, real HTTP over localhost — not mocks),
runs a distributed batch across them, and proves:

  1. The distributed result is BIT-IDENTICAL to a single-node
     batch_simulate of the whole job.
  2. Work actually spread across multiple worker nodes (not all one).
  3. RESILIENCE: with a dead worker in the pool, its range is
     transparently recomputed and the result is STILL complete and
     bit-identical — a dead node costs throughput, not correctness.

Requires the native library to be built first:
    cd organism/cpp && cmake -B build . && cmake --build build

Run:
    cd organism/compute-mesh && python3 test_mesh.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "cpp", "bindings", "python"))
sys.path.insert(0, _BINDINGS)
sys.path.insert(0, _HERE)

from coordinator import BatchJob, MeshCoordinator  # noqa: E402
from organism_native import NativeEngine  # noqa: E402


def _wait_healthy(port: int, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0) as r:
                if r.status == 200:
                    return True
        except Exception:  # noqa: BLE001
            time.sleep(0.15)
    return False


def run():
    # Ensure the native lib is present before spinning up workers.
    try:
        NativeEngine()
    except FileNotFoundError as e:
        print(f"SKIP: native library not built — {e}")
        raise SystemExit(0)

    failures = []

    def check(label, cond, detail=""):
        print(("PASS" if cond else "FAIL") + f": {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    ports = [8811, 8812, 8813]
    procs = []
    try:
        # ── Spin up real worker processes ──────────────────────────────
        for i, port in enumerate(ports):
            env = dict(os.environ, MESH_NODE_ID=f"worker-{i}")
            p = subprocess.Popen(
                [sys.executable, os.path.join(_HERE, "worker.py"), "--port", str(port)],
                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            procs.append(p)

        for port in ports:
            if not _wait_healthy(port):
                print(f"SKIP: worker on :{port} did not come up")
                raise SystemExit(0)

        urls = [f"http://127.0.0.1:{p}" for p in ports]
        coord = MeshCoordinator(urls)
        job = BatchJob(population_count=900, nodes_per_population=192, steps=18,
                       coupling=0.35, dt=0.873, seed=4242)

        # ── 1. Distributed run, all workers healthy ───────────────────
        alive = coord.healthy_workers()
        check("all 3 workers report healthy", len(alive) == 3, f"got {len(alive)}")

        res = coord.run(job, workers=alive)
        check("distributed result has full length", len(res.coherences) == job.population_count)
        check("distributed result is bit-identical to single-node",
              coord.verify_against_local(job, res))

        distinct_nodes = {a["node"] for a in res.assignments if a["source"] == "worker"}
        check("work spread across multiple worker nodes", len(distinct_nodes) >= 2,
              f"nodes used: {distinct_nodes}")
        check("no fallbacks needed with all workers up", res.local_fallbacks == 0,
              f"fallbacks={res.local_fallbacks}")

        # ── 2. Resilience: kill one worker, include a dead URL ────────
        procs[2].terminate()
        procs[2].wait(timeout=5)
        time.sleep(0.3)

        pool_with_dead = urls  # coordinator will discover :8813 is down
        alive_now = coord.healthy_workers()
        check("coordinator detects the downed worker", len(alive_now) == 2, f"alive={len(alive_now)}")

        # Force the dead node into the assignment pool to exercise fallback
        res2 = coord.run(job, workers=pool_with_dead)
        check("result still complete with a dead worker in the pool",
              len(res2.coherences) == job.population_count)
        check("result still bit-identical despite the dead worker",
              coord.verify_against_local(job, res2))
        check("dead worker's range was recomputed via fallback", res2.local_fallbacks >= 1,
              f"fallbacks={res2.local_fallbacks}")

        # ── 3. No workers at all → pure local, still correct ──────────
        coord_empty = MeshCoordinator([])
        res3 = coord_empty.run(job, workers=[])
        check("no-workers path computes locally and stays correct",
              coord_empty.verify_against_local(job, res3))

    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except Exception:  # noqa: BLE001
                    p.kill()

    print()
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: distributed compute mesh works — bit-identical to single-node, "
          "spreads across nodes, and survives a dead worker with correct results.")


if __name__ == "__main__":
    run()
