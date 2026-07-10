# Organism Runtime — C++17

Sovereign organism runtime with phi-encoded state architecture, exposed
two ways:

1. **`organism`** — a standalone always-on executable (heartbeat thread,
   runs until `SIGINT`/`SIGTERM`).
2. **`organism_native`** — the same engine as a shared library behind a
   stable **C ABI** (`include/organism_c_api.h`), so it's callable from
   Python, or any other language with a C FFI — not just from C++.

It also includes a **parallel batch compute engine** — the multi-core
"supercomputer" core: `organism_batch_simulate()` runs many independent
Kuramoto connectomes across a thread pool. Measured on a 4-core machine,
6000 populations × 512 nodes × 20 steps (61M node-steps):

| threads | time | speedup |
|---|---|---|
| 1 | 2.603 s | 1.00× (baseline) |
| 2 | 1.300 s | 2.00× |
| 3 | 0.868 s | 3.00× |
| 4 | 0.653 s | 3.99× |

Near-perfect linear scaling, with results **bit-identical across all
thread counts** (each population is seeded by index and never interacts,
so parallelism changes only the speed, never the answer — the benchmark
asserts this and fails the build if it ever diverges). These are numbers
from an actual run of `tests/bench_parallel.c`, not projections — run it
yourself with `LD_LIBRARY_PATH=build ./build/bench_parallel`.

## Constants

| Symbol | Value |
|---|---|
| PHI | 1.618033988749895 |
| GOLDEN_ANGLE | 137.508° |
| HEARTBEAT | 873 ms |

## Architecture

Four registers: **Cognitive**, **Affective**, **Somatic**, **Sovereign**.
Each contains three phi-weighted fields. Vitality is scored across all
registers using golden-ratio weighting.

The C ABI additionally exposes the Kuramoto phase-coupling primitives
(`organism_order_parameter`, `organism_mean_field_step`,
`organism_phi_decay`) — these mirror `organism/python/organism/physics.py`
function-for-function, verified numerically identical by
`bindings/python/test_parity.py` (order parameter, a 50-tick mean-field
trajectory, and phi-decay all checked against the pure-Python reference —
not just a single spot-check).

## Build

```bash
cd organism/cpp
cmake -B build .
cmake --build build
```

Builds (Release-optimized by default): `organism` (the standalone
executable), `organism_native` (the shared library —
`liborganism_native.so` on Linux, `.dylib` on macOS, `.dll` on Windows),
`test_c_api` (a pure-C test program exercising the shared library through
its public header, not through any C++-only path), and `bench_parallel`
(the parallel-engine correctness + speedup benchmark).

## Run the standalone executable

```bash
./build/organism
```

Runs forever. Send `SIGINT` (Ctrl-C) or `SIGTERM` to shut down gracefully.

## Test

```bash
cd build && ctest --output-on-failure
```

Or run the C test directly for more detail:

```bash
LD_LIBRARY_PATH=build ./build/test_c_api
```

`ctest` runs two tests: `c_api_test` (the full stateful lifecycle) and
`parallel_correctness` (the batch benchmark, which exits non-zero if
parallel results ever diverge from the single-thread baseline).

Every check in `tests/test_c_api.c`, `tests/bench_parallel.c`, and
`bindings/python/test_*.py` was actually run (not just written) before
being called done, including under `valgrind --leak-check=full` — 0
leaks, 0 errors, across the full lifecycle: state create → register
set/get → heartbeat create → start → real background-thread ticks →
callback fires into the caller → stop → destroy.

## Use the C API

`include/organism_c_api.h` is the contract. Three families of functions:

- **Pure physics** (`organism_order_parameter`, `organism_mean_field_step`,
  `organism_phi_decay`) — no state, just numbers in and out.
- **Parallel batch compute** (`organism_batch_simulate`,
  `organism_hardware_threads`) — the multi-core engine: run many
  independent connectomes across a thread pool in one call.
- **Stateful runtime** (`organism_state_create`/`_destroy`,
  `organism_heartbeat_create`/`_start`/`_stop`/`_destroy`) — opaque
  handles wrapping the four-register state and the 873ms heartbeat
  thread, so you can embed the always-on organism in a host process
  instead of running it as the standalone executable.

### From C or C++

```c
#include "organism_c_api.h"

organism_state_t* state = organism_state_create();
organism_heartbeat_t* hb = organism_heartbeat_create(state);
organism_heartbeat_on_beat(hb, my_callback, NULL);
organism_heartbeat_start(hb);
/* ... */
organism_heartbeat_destroy(hb);  /* stops it too */
organism_state_destroy(state);
```

Link against `organism_native`:

```bash
gcc -std=c11 myapp.c -Iorganism/cpp/include -Lorganism/cpp/build -lorganism_native -o myapp
```

### From Python

```python
from organism_native import NativeEngine, REGISTER_SOVEREIGN, RegisterState

engine = NativeEngine()  # auto-locates the built .so relative to this file
r, psi = engine.order_parameter([0.1, 0.5, 1.2])

# Parallel batch: 4000 independent connectomes across all cores, one call.
coherences = engine.batch_simulate(
    population_count=4000, nodes_per_population=384, steps=20,
    coupling=0.35, dt=0.873, seed=42, threads=-1,  # -1 = all hardware threads
)

with engine.create_state() as state:
    hb = state.heartbeat()
    hb.on_beat(lambda beat: print(f"beat {beat}"))
    hb.start()
    # ... hb.stop() when done; state.close() (or the `with` block) tears
    # down the heartbeat too
```

See `bindings/python/organism_native.py` for the full binding and
`bindings/python/test_parity.py` / `test_stateful.py` /
`test_supercompute.py` for working examples of everything above.

## What's verified vs. what's a starting point

**Verified by actually building, running, and testing it** (not assumed):
clean compile under `-Wall -Wextra -Werror` in both the C++17 library and
the pure-C test/benchmark programs; zero valgrind leaks/errors across the
full stateful lifecycle including the multithreaded heartbeat callback;
exact numerical parity with the Python reference implementation across
single calls and a 50-tick trajectory; the parallel engine's near-linear
speedup (3.99× on 4 cores) with bit-identical results across every thread
count, measured — not projected; the Python ctypes binding's
opaque-handle lifecycle (context manager, `__del__` cleanup, callback
lifetime pinning so ctypes doesn't garbage-collect a callback the C side
still holds).

**Honest ceiling on the "supercomputer" claim**: this is real
shared-memory multi-core parallelism (one machine, all its cores, with
measured near-linear scaling) — not a distributed cluster. The natural
next step to genuine cluster scale is distributing batches across the
fleet's targets (the Aether platform already models Cloudflare Workers /
ICP canisters / bare-metal nodes as deploy targets) so `batch_simulate`'s
population range is partitioned across machines, not just across a single
box's cores. That distribution layer is not built yet; the single-node
parallel engine it would sit on top of is.

**Also not yet built**: bindings for other languages (Node via
node-ffi-napi or N-API, a WASM build via Emscripten) — the C header is
the contract that would make either straightforward, but neither has been
written.
