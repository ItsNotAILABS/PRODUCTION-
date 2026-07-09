"""
Exercises the stateful C API (organism_state_t, organism_heartbeat_t) —
the always-on runtime, not just the pure physics functions. This is the
riskier half to get right over ctypes: opaque handle lifecycle, a
callback crossing the FFI boundary from a background C++ thread back
into Python, and cleanup ordering. Run it, don't just trust the code.

Run:
    cd organism/cpp/bindings/python
    python3 test_stateful.py
"""
from __future__ import annotations

import time

from organism_native import NativeEngine, REGISTER_SOVEREIGN, RegisterState


def run():
    failures = []

    def check(label: str, cond: bool, detail: str = ""):
        status = "PASS" if cond else "FAIL"
        print(f"{status}: {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    engine = NativeEngine()

    with engine.create_state() as state:
        # -- register set/get round-trip -----------------------------------
        sov = RegisterState()
        sov.autonomy = 1.0
        sov.coherence = 0.87
        sov.integrity = 0.95
        state.set_register(REGISTER_SOVEREIGN, sov)
        readback = state.get_register(REGISTER_SOVEREIGN)
        check(
            "register set/get round-trips exactly",
            readback.autonomy == 1.0 and readback.coherence == 0.87 and readback.integrity == 0.95,
            f"got autonomy={readback.autonomy} coherence={readback.coherence} integrity={readback.integrity}",
        )

        # -- vitality is computable and in a sane range ----------------------
        v = state.vitality
        check("vitality score is a finite number in [0, 2]", 0.0 <= v <= 2.0, f"vitality={v}")

        # -- heartbeat: start it, let it actually tick, verify callback fires
        # from the background C++ thread and reaches Python correctly ------
        beats_seen = []

        def on_beat(beat_count: int) -> None:
            beats_seen.append(beat_count)

        hb = state.heartbeat()
        hb.on_beat(on_beat)
        hb.start()

        # HEARTBEAT_MS is 873ms — sleep long enough for several real beats
        time.sleep(3.2)
        hb.stop()

        check("heartbeat produced multiple beats in ~3.2s", len(beats_seen) >= 2,
              f"beats_seen={beats_seen}")
        check("heartbeat.count matches callback invocation count", hb.count == len(beats_seen),
              f"hb.count={hb.count} len(beats_seen)={len(beats_seen)}")
        check("beat numbers are strictly increasing", beats_seen == sorted(beats_seen),
              f"beats_seen={beats_seen}")
        check("state.beat_count reflects the heartbeat's ticks", state.beat_count == hb.count,
              f"state.beat_count={state.beat_count} hb.count={hb.count}")

        # -- confirm it's really stopped: no more beats after stop() -------
        count_after_stop = hb.count
        time.sleep(2.0)
        check("no further beats after stop()", hb.count == count_after_stop,
              f"count_after_stop={count_after_stop} count_now={hb.count}")

    # `with` block exited — state.close() ran, which stops+destroys the
    # heartbeat and destroys the state. If this doesn't crash / hang, cleanup
    # ordering (heartbeat before state, since heartbeat holds a reference) is correct.
    print()
    check("context manager exited cleanly (no crash/hang on teardown)", True)

    print()
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: all stateful-API checks passed — the always-on heartbeat is real and callable from Python.")


if __name__ == "__main__":
    run()
