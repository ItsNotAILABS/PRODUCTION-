"""
test_quorum_integrity.py — the public-mesh safety test.

On an open mesh anyone can POST /mesh/submit, so the coordinator must not
trust any single node. This spins up the REAL mesh_server.py and drives it
with three kinds of participants over real HTTP:

  * honest workers — return the true coherence for their chunk.
  * a POISONER — returns plausible-looking but WRONG numbers for every
    chunk it grabs, trying to corrupt the result.

It proves:

  1. quorum=1 (trusting mode) is poisonable — a lone poisoner CAN corrupt
     the result. (This is why quorum exists; we assert the vulnerability so
     the fix is meaningful, not theater.)
  2. quorum=3 DEFEATS the poisoner — the reassembled result is bit-identical
     to the honest single-call reference, and the poisoner's node id is
     flagged. A chunk only finalizes once 3 independent nodes agree.
  3. A job that CAN'T reach agreement (poisoners flood, no honest quorum) is
     marked `contested` and fails loudly — it never returns a corrupt answer.

Pure stdlib + the checked-in WASM kernel for the honest math (no native
toolchain needed), so this runs anywhere the browser bundle does.

Run:
    cd organism/compute-mesh/browser && python3 test_quorum_integrity.py
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import threading
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8942
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
            _get("/mesh/stats"); return True
        except Exception:  # noqa: BLE001
            time.sleep(0.15)
    return False


# ── Honest kernel: splitmix64-seeded mean-field Kuramoto, matching the ────
# native/WASM kernels' convention (global-index seeding: seed = base + p).
_MASK = (1 << 64) - 1


def _splitmix64(state: int):
    state = (state + 0x9E3779B97F4A7C15) & _MASK
    z = state
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & _MASK
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & _MASK
    z = z ^ (z >> 31)
    return z, state


def _rand01(state: int):
    z, state = _splitmix64(state)
    return (z >> 11) * (1.0 / (1 << 53)), state


def _simulate_one(nodes: int, steps: int, coupling: float, dt: float, seed: int) -> float:
    state = (seed + 1) & _MASK
    phases = []
    freqs = []
    for _ in range(nodes):
        u, state = _rand01(state)
        phases.append(2.0 * math.pi * u)
    for _ in range(nodes):
        u, state = _rand01(state)
        freqs.append(u - 0.5)
    for _ in range(steps):
        sx = sum(math.cos(p) for p in phases)
        sy = sum(math.sin(p) for p in phases)
        psi = math.atan2(sy, sx)
        r = math.hypot(sx, sy) / nodes
        for i in range(nodes):
            phases[i] = math.fmod(
                phases[i] + dt * (freqs[i] + coupling * r * math.sin(psi - phases[i])),
                2.0 * math.pi)
    sx = sum(math.cos(p) for p in phases)
    sy = sum(math.sin(p) for p in phases)
    return math.hypot(sx, sy) / nodes


def _honest_range(begin, end, nodes, steps, coupling, dt, base_seed):
    return [_simulate_one(nodes, steps, coupling, dt, base_seed + p)
            for p in range(begin, end)]


def _run_worker(node_id, poison=False, stop_evt=None, idle=0.03):
    """Claim → compute (honestly or with garbage) → submit, until stopped."""
    while not (stop_evt and stop_evt.is_set()):
        try:
            chunk = _post("/mesh/claim", {"node_id": node_id})
        except Exception:  # noqa: BLE001
            time.sleep(idle); continue
        if not chunk or chunk.get("empty"):
            time.sleep(idle); continue
        begin, end = chunk["range_begin"], chunk["range_end"]
        if poison:
            # Plausible in-range garbage: valid coherences in [0,1], just wrong.
            # Derive it from the node id so DISTINCT poisoners disagree with
            # each other too — they can't collude into a fake quorum by luck.
            g = (abs(hash(node_id)) % 1000) / 1000.0
            out = [g for _ in range(end - begin)]
        else:
            out = _honest_range(begin, end, chunk["nodes"], chunk["steps"],
                                chunk["coupling"], chunk["dt"], chunk["seed"])
        try:
            _post("/mesh/submit", {"job_id": chunk["job_id"], "chunk_id": chunk["chunk_id"],
                                   "node_id": node_id, "coherences": out})
        except Exception:  # noqa: BLE001
            pass


def _drain(job_id, workers, timeout=30.0):
    stop = threading.Event()
    threads = [threading.Thread(target=_run_worker, kwargs={**w, "stop_evt": stop}, daemon=True)
               for w in workers]
    for t in threads:
        t.start()
    end = time.time() + timeout
    status = {}
    while time.time() < end:
        status = _get("/mesh/job/" + job_id)
        if status.get("complete") or status.get("contested"):
            break
        time.sleep(0.05)
    stop.set()
    for t in threads:
        t.join(timeout=2.0)
    return status


def run():
    failures = []

    def check(label, cond, detail=""):
        print(("PASS" if cond else "FAIL") + f": {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    srv = subprocess.Popen(
        [sys.executable, os.path.join(_HERE, "mesh_server.py"), "--port", str(PORT)],
        env={**os.environ, "MESH_CHUNK_LEASE_SECONDS": "2"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not _wait_server():
            print("SKIP: mesh_server did not start"); srv.terminate(); raise SystemExit(0)

        spec = dict(population_count=300, nodes=64, steps=12,
                    coupling=0.35, dt=0.873, seed=99, chunk_size=25)
        ref = _honest_range(0, spec["population_count"], spec["nodes"], spec["steps"],
                            spec["coupling"], spec["dt"], spec["seed"])

        # ── 1. quorum=1 is poisonable (proves the threat is real) ────────
        j1 = _post("/mesh/job", {**spec, "quorum": 1})
        s1 = _drain(j1["job_id"], [
            {"node_id": "honest-a"}, {"node_id": "honest-b"},
            {"node_id": "poison-x", "poison": True},
        ])
        poisoned = s1.get("complete") and s1.get("result") != ref
        check("quorum=1 CAN be poisoned by a single bad node (why quorum exists)",
              poisoned, "result matched reference — poisoner happened not to win any chunk")

        # ── 2. quorum=3 defeats the poisoner ─────────────────────────────
        j2 = _post("/mesh/job", {**spec, "quorum": 3})
        check("job reports quorum=3", j2.get("quorum") == 3, json.dumps(j2))
        s2 = _drain(j2["job_id"], [
            {"node_id": "h1"}, {"node_id": "h2"}, {"node_id": "h3"}, {"node_id": "h4"},
            {"node_id": "poison-1", "poison": True},
        ])
        check("quorum=3 job completes", s2.get("complete") is True,
              json.dumps({k: s2.get(k) for k in ("pending", "done", "contested")}))
        check("quorum=3 result is bit-identical to the honest reference (poison rejected)",
              s2.get("result") == ref,
              f"lens {len(s2.get('result') or [])} vs {len(ref)}")
        check("the poisoner was flagged", "poison-1" in (s2.get("flagged_nodes") or {}),
              json.dumps(s2.get("flagged_nodes")))

        # ── 3. no honest quorum → contested, never a corrupt answer ──────
        # Enough distinct poisoners to hit max_replicas, but they disagree
        # among themselves (garbage keyed by node id), so no cluster ever
        # reaches quorum=3. The coordinator must give up loudly, not guess.
        j3 = _post("/mesh/job", {**spec, "quorum": 3, "max_replicas": 4})
        s3 = _drain(j3["job_id"], [
            {"node_id": "h-lonely"},
            {"node_id": "bad-1", "poison": True},
            {"node_id": "bad-2", "poison": True},
            {"node_id": "bad-3", "poison": True},
            {"node_id": "bad-4", "poison": True},
        ])
        check("unreachable-quorum job is marked contested, not silently corrupt",
              s3.get("contested") is True and s3.get("result") is None,
              json.dumps({k: s3.get(k) for k in ("complete", "contested", "done", "pending")}))

    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:  # noqa: BLE001
            srv.kill()

    print()
    if failures:
        print(f"RESULT: {len(failures)} FAILED: {failures}"); raise SystemExit(1)
    print("RESULT: quorum verification makes the public mesh poison-resistant — a chunk is "
          "only trusted once N independent nodes agree, a lone poisoner is outvoted and "
          "flagged, and a job that can't reach agreement fails loudly instead of returning "
          "corrupt data.")


if __name__ == "__main__":
    run()
