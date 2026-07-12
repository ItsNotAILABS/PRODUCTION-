#!/usr/bin/env python3
"""
gen_reference.py — emit native-engine reference coherences for a global
population range, as JSON, for test_kernel_parity.js to compare against.

Usage:
    gen_reference.py <begin> <end> <nodes> <steps> <coupling> <dt> <seed>

Prints a JSON array of doubles (the native engine's coherence for each
population in [begin, end), using the same base-seed offset the workers
use). Requires the native library to be built.
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BINDINGS = os.path.normpath(os.path.join(_HERE, "..", "..", "cpp", "bindings", "python"))
sys.path.insert(0, _BINDINGS)

from organism_native import NativeEngine  # noqa: E402


def main() -> None:
    begin, end, nodes, steps = (int(sys.argv[i]) for i in range(1, 5))
    coupling, dt = float(sys.argv[5]), float(sys.argv[6])
    seed = int(sys.argv[7])

    engine = NativeEngine()
    # Same convention as worker.py: range [begin,end) computed with seed+begin.
    coherences = engine.batch_simulate(
        population_count=end - begin,
        nodes_per_population=nodes,
        steps=steps,
        coupling=coupling,
        dt=dt,
        seed=seed + begin,
        threads=1,
    )
    json.dump(coherences, sys.stdout)


if __name__ == "__main__":
    main()
