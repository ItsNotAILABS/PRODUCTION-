"""
Numerical parity test: the compiled C++ engine (via ctypes) must produce
results identical (within float tolerance) to organism.python.organism.physics's
pure-Python implementation, for the same inputs. This is the actual proof
that organism_native.py isn't just "a binding that loads" but "a binding
that computes the right answer" — run it, don't just read the docstring.

Run:
    cd organism/cpp/bindings/python
    PYTHONPATH=../../../python:. python3 test_parity.py
"""
from __future__ import annotations

import math
import random
import sys

from organism_native import NativeEngine

try:
    from organism.physics import mean_field_kuramoto_step as py_mean_field_step
    from organism.physics import order_parameter as py_order_parameter
    from organism.physics import phi_decay as py_phi_decay
except ImportError as e:
    print(f"FAIL: could not import organism.physics — run with "
          f"PYTHONPATH=../../../python:. set. ({e})")
    sys.exit(1)

TOLERANCE = 1e-9


def approx(a: float, b: float, tol: float = TOLERANCE) -> bool:
    return abs(a - b) <= tol


def run():
    engine = NativeEngine()
    failures = []

    def check(label: str, cond: bool, detail: str = ""):
        status = "PASS" if cond else "FAIL"
        print(f"{status}: {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    # -- order_parameter parity, several phase sets --------------------
    rng = random.Random(42)
    test_sets = [
        [0.0],
        [0.0, math.pi],
        [0.1, 0.5, 1.2, 2.4, 3.9],
        [rng.uniform(0, 2 * math.pi) for _ in range(96)],  # matches NeuroEmergence node_count
    ]
    for i, phases in enumerate(test_sets):
        native_r, native_psi = engine.order_parameter(phases)
        py_r, py_psi = py_order_parameter(phases)
        check(
            f"order_parameter set {i} (n={len(phases)}) R matches",
            approx(native_r, py_r),
            f"native={native_r!r} py={py_r!r}",
        )
        check(
            f"order_parameter set {i} (n={len(phases)}) psi matches",
            approx(native_psi, py_psi),
            f"native={native_psi!r} py={py_psi!r}",
        )

    # -- mean_field_step parity ------------------------------------------
    node_ids = [f"n{i}" for i in range(24)]
    phases_list = [rng.uniform(0, 2 * math.pi) for _ in node_ids]
    activities_list = [rng.uniform(0.3, 1.0) for _ in node_ids]
    phases_dict = dict(zip(node_ids, phases_list))
    activities_dict = dict(zip(node_ids, activities_list))
    coupling = 1.0 / engine.phi  # PHI_INV, same constant the whole ecosystem uses
    dt = engine.heartbeat_ms / 1000.0

    native_next = engine.mean_field_step(phases_list, activities_list, coupling, dt)
    py_next_dict = py_mean_field_step(phases_dict, activities_dict, coupling, dt)
    py_next = [py_next_dict[nid] for nid in node_ids]

    all_match = all(approx(a, b) for a, b in zip(native_next, py_next))
    check(
        "mean_field_step (24 nodes, one 873ms tick) matches element-wise",
        all_match,
        f"first mismatch at index "
        f"{next((i for i, (a, b) in enumerate(zip(native_next, py_next)) if not approx(a, b)), None)}"
        if not all_match else "",
    )

    # -- run it forward 50 ticks and confirm no drift accumulates -------
    native_state = list(phases_list)
    py_state = dict(phases_dict)
    for _ in range(50):
        native_state = engine.mean_field_step(native_state, activities_list, coupling, dt)
        py_state = py_mean_field_step(py_state, activities_dict, coupling, dt)
    py_state_ordered = [py_state[nid] for nid in node_ids]
    drift_ok = all(approx(a, b, tol=1e-6) for a, b in zip(native_state, py_state_ordered))
    max_drift = max(abs(a - b) for a, b in zip(native_state, py_state_ordered))
    check("50-tick trajectory: native and Python stay in sync", drift_ok, f"max_drift={max_drift:.2e}")

    # -- phi_decay parity --------------------------------------------------
    for initial, age in [(1.0, 0.0), (5.0, 137.508), (2.5, 500.0)]:
        native_v = engine.phi_decay(initial, age)
        py_v = py_phi_decay(initial, age)
        check(f"phi_decay(initial={initial}, age_s={age})", approx(native_v, py_v),
              f"native={native_v!r} py={py_v!r}")

    # -- constants match -----------------------------------------------
    from organism.constants import GOLDEN_ANGLE, PHI
    check("PHI constant matches", approx(engine.phi, PHI))
    check("GOLDEN_ANGLE constant matches", approx(engine.golden_angle, GOLDEN_ANGLE))

    print()
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED: {failures}")
        sys.exit(1)
    else:
        print("RESULT: all checks passed — native engine is numerically identical to the Python reference.")


if __name__ == "__main__":
    run()
