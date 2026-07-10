# Browser compute nodes — WASM kernel

Turns any device that opens a page — phone, laptop, tab — into a compute
node for the mesh, by running the organism Kuramoto kernel **compiled to
WebAssembly** in a Web Worker. The device pulls population ranges from the
coordinator, computes them at near-native speed, and returns results.

## Why WASM, not hand-written JS

Two reasons, both measured (not assumed):

1. **Speed.** The compiled kernel (`kernel_wasm.c` → `kernel.wasm`) runs
   the tight numerical loop at near-native speed. Measured ~1.2× faster
   than the pure-JS kernel in Node (same V8 that runs in Chrome) — and the
   gap widens on the simpler JS engines phones sometimes use. `test_wasm.js`.
2. **Determinism.** WASM has native `i64` (splitmix64 is exact, no BigInt)
   and native `f64.sqrt` / `f64.trunc` (so `hypot` and `fmod` are
   host-independent). Only `sin/cos/atan2` are host imports — shrinking the
   sources of cross-engine rounding difference from "all of libm" to three
   functions.

The pure-JS kernel (`mesh_kernel.js`) is kept as a fallback for any
environment where WASM won't load.

## Parity, stated honestly

- **WASM node vs WASM node** (browser vs browser vs Node): identical by
  construction — same bytes, same spec-deterministic arithmetic.
- **WASM/JS node vs the native C++ server engine**: agree to **machine
  epsilon** (max abs diff 5.55e-16 measured — `test_kernel_parity.js`), not
  always bit-for-bit, because V8's `sin/cos/atan2` round differently than
  glibc's in the last bit. This is well within any physically meaningful
  tolerance for a coherence value in [0,1]. The mesh coordinator anchors
  final results to the native engine via local fallback when exactness
  matters.
- Exact cross-node-type parity would need software `sin/cos` compiled into
  the WASM (removing the last host imports). That's the documented next
  step; the current three-import build is what's built and tested.

## Files

| file | what |
|---|---|
| `kernel_wasm.c` | the kernel, C for a freestanding wasm32 target |
| `build.sh` | compiles it with `clang --target=wasm32` (no Emscripten) |
| `kernel.wasm` | the built module (checked in so nodes need no toolchain) |
| `wasm_runner.js` | loads the module, exposes `batchSimulateRange()` |
| `mesh_kernel.js` | pure-JS fallback kernel, same interface |
| `test_wasm.js` | WASM correctness + speed vs JS |
| `test_kernel_parity.js` | JS/WASM vs the native engine (via `gen_reference.py`) |

## Build & test

```bash
cd organism/compute-mesh/browser
./build.sh                 # produces kernel.wasm
node test_wasm.js          # correctness + speed
node test_kernel_parity.js # parity vs the native C++ engine
```

## Not yet built (next steps)

- The browser node **page** (`node.html`) that spawns one Web Worker per
  `navigator.hardwareConcurrency` and auto-joins the mesh — so opening a
  URL on a phone contributes all its cores. The kernel and runner it needs
  are done; the page + a pull-based coordinator work-queue (browsers pull
  work, they can't be pushed to) are the remaining pieces.
- Software `sin/cos` in the WASM for exact cross-node-type parity.
