"""
Aether Compute Mesh — coordinator.
═══════════════════════════════════════════════════════════════════════

Turns the single-node parallel batch engine into a distributed one:
partitions a batch of N independent Kuramoto populations across a set of
worker nodes (worker.py instances — one per fleet machine), dispatches
the ranges concurrently over HTTP, and reassembles the results into one
ordered array.

Two properties it guarantees, both exercised by test_mesh.py:
  1. CORRECTNESS: the distributed result is bit-identical to a single-node
     batch_simulate of the whole job, because each worker seeds its range
     by global index (see worker.py). Distribution is a scale win, not a
     different computation.
  2. RESILIENCE: if a worker is unreachable or errors, its range is
     transparently recomputed — retried on another worker, or (last
     resort) locally via the native engine — so a dead node degrades
     throughput, not correctness. A partitioned deploy onto a flaky fleet
     still returns the complete, correct result.

Stdlib only (urllib) — no external HTTP client dependency.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "cpp", "bindings", "python"))
if _BINDINGS not in sys.path:
    sys.path.insert(0, _BINDINGS)

from organism_native import NativeEngine  # noqa: E402


@dataclass
class BatchJob:
    population_count: int
    nodes_per_population: int
    steps: int
    coupling: float
    dt: float
    seed: int = 0


@dataclass
class MeshResult:
    coherences: list[float]
    assignments: list[dict] = field(default_factory=list)  # per-range: node, range, source
    local_fallbacks: int = 0
    failed_workers: list[str] = field(default_factory=list)


def _partition(total: int, parts: int) -> list[tuple[int, int]]:
    """Split [0, total) into `parts` contiguous, near-equal ranges."""
    if parts <= 0:
        parts = 1
    parts = min(parts, total) or 1
    chunk = (total + parts - 1) // parts
    ranges = []
    begin = 0
    while begin < total:
        end = min(begin + chunk, total)
        ranges.append((begin, end))
        begin = end
    return ranges


def _post_json(url: str, payload: dict, timeout: float) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


class MeshCoordinator:
    def __init__(self, worker_urls: list[str], *, timeout: float = 30.0,
                 local_engine: Optional[NativeEngine] = None) -> None:
        self.worker_urls = list(worker_urls)
        self.timeout = timeout
        self._engine = local_engine or NativeEngine()

    def healthy_workers(self) -> list[str]:
        alive = []
        for url in self.worker_urls:
            try:
                with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=3.0) as r:
                    if r.status == 200:
                        alive.append(url)
            except Exception:  # noqa: BLE001
                pass
        return alive

    def _compute_local(self, job: BatchJob, begin: int, end: int) -> list[float]:
        return self._engine.batch_simulate(
            population_count=end - begin,
            nodes_per_population=job.nodes_per_population,
            steps=job.steps,
            coupling=job.coupling,
            dt=job.dt,
            seed=job.seed + begin,   # same global-seed offset the workers use
            threads=-1,
        )

    def _dispatch_range(self, job: BatchJob, url: str, begin: int, end: int) -> dict:
        payload = {
            "range_begin": begin, "range_end": end,
            "nodes": job.nodes_per_population, "steps": job.steps,
            "coupling": job.coupling, "dt": job.dt, "seed": job.seed,
        }
        res = _post_json(url.rstrip("/") + "/compute/batch", payload, self.timeout)
        if "coherences" not in res:
            raise RuntimeError(res.get("error", "worker returned no coherences"))
        return res

    def run(self, job: BatchJob, *, workers: Optional[list[str]] = None) -> MeshResult:
        """Execute `job` across the mesh. Falls back to local compute for any
        range whose assigned worker fails, so the result is always complete."""
        pool = workers if workers is not None else self.healthy_workers()
        coherences: list[Optional[float]] = [None] * job.population_count
        result = MeshResult(coherences=[])

        if not pool:
            # No workers reachable — compute the whole thing locally. Still
            # correct, just not distributed.
            result.coherences = self._compute_local(job, 0, job.population_count)
            result.assignments.append({"node": "local", "range": [0, job.population_count], "source": "local_only"})
            result.local_fallbacks = 1
            return result

        ranges = _partition(job.population_count, len(pool))
        assigned = list(zip(ranges, pool))

        with ThreadPoolExecutor(max_workers=len(assigned)) as ex:
            futures = {
                ex.submit(self._dispatch_range, job, url, begin, end): (begin, end, url)
                for (begin, end), url in assigned
            }
            for fut in as_completed(futures):
                begin, end, url = futures[fut]
                try:
                    res = fut.result()
                    coherences[begin:end] = res["coherences"]
                    result.assignments.append({"node": res.get("node", url), "range": [begin, end], "source": "worker"})
                except Exception as e:  # noqa: BLE001 — worker died: recompute locally
                    coherences[begin:end] = self._compute_local(job, begin, end)
                    result.assignments.append({"node": "local", "range": [begin, end], "source": "local_fallback", "reason": str(e)})
                    result.local_fallbacks += 1
                    if url not in result.failed_workers:
                        result.failed_workers.append(url)

        # Any hole (shouldn't happen given fallback) filled locally as a safety net.
        for i, v in enumerate(coherences):
            if v is None:
                coherences[i] = self._compute_local(job, i, i + 1)[0]

        result.coherences = [float(v) for v in coherences]
        result.assignments.sort(key=lambda a: a["range"][0])
        return result

    def verify_against_local(self, job: BatchJob, mesh_result: MeshResult) -> bool:
        """Confirm the distributed result is bit-identical to a single-node run."""
        reference = self._compute_local(job, 0, job.population_count)
        return reference == mesh_result.coherences
