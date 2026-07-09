# Organism Runtime — C++17

Sovereign organism runtime with phi-encoded state architecture, exposed
two ways:

1. **`organism`** — a standalone always-on executable (heartbeat thread,
   runs until `SIGINT`/`SIGTERM`).
2. **`organism_native`** — the same engine as a shared library behind a
   stable **C ABI** (`include/organism_c_api.h`), so it's callable from
   Python, or any other language with a C FFI — not just from C++.

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

Builds three targets: `organism` (the standalone executable),
`organism_native` (the shared library — `liborganism_native.so` on
Linux, `.dylib` on macOS, `.dll` on Windows), and `test_c_api` (a pure-C
test program exercising the shared library through its public header,
not through any C++-only path).

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

Every check in `tests/test_c_api.c` and `bindings/python/test_*.py` was
actually run (not just written) before being called done, including
under `valgrind --leak-check=full` — 0 leaks, 0 errors, across the
full lifecycle: state create → register set/get → heartbeat create →
start → real background-thread ticks → callback fires into the caller →
stop → destroy.

## Use the C API

`include/organism_c_api.h` is the contract. Two families of functions:

- **Pure physics** (`organism_order_parameter`, `organism_mean_field_step`,
  `organism_phi_decay`) — no state, just numbers in and out.
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

with engine.create_state() as state:
    hb = state.heartbeat()
    hb.on_beat(lambda beat: print(f"beat {beat}"))
    hb.start()
    # ... hb.stop() when done; state.close() (or the `with` block) tears
    # down the heartbeat too
```

See `bindings/python/organism_native.py` for the full binding and
`bindings/python/test_parity.py` / `test_stateful.py` for working
examples of everything above.

## What's verified vs. what's a starting point

**Verified by actually building, running, and testing it** (not assumed):
clean compile under `-Wall -Wextra -Werror` in both the C++17 library and
the pure-C test program; zero valgrind leaks/errors across the full
stateful lifecycle including the multithreaded heartbeat callback; exact
numerical parity with the Python reference implementation across single
calls and a 50-tick trajectory; the Python ctypes binding's opaque-handle
lifecycle (context manager, `__del__` cleanup, callback lifetime pinning
so ctypes doesn't garbage-collect a callback the C side still holds).

**Not yet built**: bindings for other languages (Node via node-ffi-napi
or N-API, a WASM build via Emscripten) — the C header is the contract
that would make either straightforward, but neither has been written.
