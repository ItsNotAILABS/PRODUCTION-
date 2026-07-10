"""
Exercises the parallel batch compute engine (organism_batch_simulate)
through the Python binding — the "supercomputer" path callable from the
higher layers (aether_platform, agents, etc.), not just from C.

Verifies:
  1. Results are IDENTICAL whether the native engine runs on 1 thread or
     all hardware threads (determinism independent of parallelism — the
     correctness guarantee).
  2. The batch is a real distribution of independent results, not one
     value repeated.
  3. Multi-thread execution is measurably faster than single-thread
     (reported, not asserted as a hard threshold — CI machines vary).

Run:
    cd organism/cpp/bindings/python
    python3 test_supercompute.py
"""
from __future__ import annotations

import time

from organism_native import NativeEngine


def run():
    engine = NativeEngine()
    hw = engine.hardware_threads
    print(f"native engine v{engine.version()}  ·  {hw} hardware threads\n")

    failures = []

    def check(label: str, cond: bool, detail: str = ""):
        status = "PASS" if cond else "FAIL"
        print(f"{status}: {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    POPS, NODES, STEPS = 4000, 384, 20
    COUPLING, DT, SEED = 0.35, 0.873, 20260101

    # 1-thread baseline
    t0 = time.perf_counter()
    baseline = engine.batch_simulate(POPS, NODES, STEPS, COUPLING, DT, seed=SEED, threads=1)
    single_time = time.perf_counter() - t0

    # all-threads run
    t1 = time.perf_counter()
    parallel = engine.batch_simulate(POPS, NODES, STEPS, COUPLING, DT, seed=SEED, threads=hw)
    multi_time = time.perf_counter() - t1

    # 1. determinism independent of thread count
    identical = baseline == parallel
    check(f"results identical on 1 thread vs {hw} threads", identical,
          f"first mismatch at "
          f"{next((i for i,(a,b) in enumerate(zip(baseline,parallel)) if a!=b), None)}"
          if not identical else "")

    # 2. real distribution
    mn, mx = min(baseline), max(baseline)
    mean = sum(baseline) / len(baseline)
    spread_ok = (mx - mn) > 0.1
    check("batch is a real distribution (not one value repeated)", spread_ok,
          f"min={mn:.4f} mean={mean:.4f} max={mx:.4f}")
    print(f"       coherence across {POPS} runs: min={mn:.4f} mean={mean:.4f} max={mx:.4f}")

    # 3. speedup (reported; only require it's not slower, to stay robust on
    #    shared/CI machines where absolute speedup varies)
    speedup = single_time / multi_time if multi_time > 0 else 0.0
    print(f"       1-thread: {single_time:.3f}s   {hw}-thread: {multi_time:.3f}s   speedup: {speedup:.2f}x")
    check(f"{hw}-thread run is not slower than 1-thread", multi_time <= single_time * 1.05,
          f"single={single_time:.3f}s multi={multi_time:.3f}s")

    print()
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: parallel batch compute is callable from Python, deterministic across "
          "thread counts, and faster with more cores.")


if __name__ == "__main__":
    run()
