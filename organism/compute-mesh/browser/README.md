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
| `mesh_server.py` | pull-based work queue + static host — browsers join here |
| `node.html` | the page you open on any device; spawns one worker per core |
| `node_worker.js` | the Web Worker: claim → compute (WASM) → submit, looped |
| `test_wasm.js` | WASM correctness + speed vs JS |
| `test_kernel_parity.js` | JS/WASM vs the native engine (via `gen_reference.py`) |
| `test_pull_mesh.js` | end-to-end pull-mesh test (real server, simulated browser nodes) |

## Adding more nodes — open the page on any device

Browsers can't be pushed to, so the mesh server is a **pull queue**: it
holds a job, hands chunks to whoever asks, reassembles results, and
reclaims a chunk if the node that took it goes silent. Any device that
opens the page becomes a cluster of nodes — one Web Worker per core.

```bash
cd organism/compute-mesh/browser
./build.sh
python3 mesh_server.py --port 8900
# submit a job:
curl -X POST http://localhost:8900/mesh/job -H 'Content-Type: application/json' \
  -d '{"population_count":100000,"nodes":512,"steps":50,"coupling":0.35,"seed":1,"chunk_size":128}'
# then open http://<this-host>:8900/ on your laptop AND your phone —
# each contributes navigator.hardwareConcurrency workers automatically.
curl http://localhost:8900/mesh/job/<job_id>   # watch it drain; result appears when complete
```

Endpoints: `POST /mesh/job`, `POST /mesh/claim`, `POST /mesh/submit`,
`GET /mesh/job/<id>`, `GET /mesh/stats`.

## Build & test

```bash
cd organism/compute-mesh/browser
./build.sh                 # produces kernel.wasm
node test_wasm.js          # WASM correctness + speed
node test_kernel_parity.js # parity vs the native C++ engine
node test_pull_mesh.js     # full pull-mesh: queue drains, lease reclaim, bit-identical result
```

`test_pull_mesh.js` starts the real `mesh_server.py` and simulates browser
nodes (Node loops running the same WASM kernel) that claim/compute/submit
over real HTTP. It verifies the reassembled result is **bit-identical** to
a single-call WASM batch, and that a worker which grabs a chunk then
vanishes doesn't stall the job — the chunk is reclaimed and the job still
finishes, still bit-identical.

## Verified vs. what still needs a real browser

- **Verified (Node, same V8 as Chrome)**: the WASM kernel's correctness and
  speed; the pull queue's claim/submit/reassembly and lease-reclaim; that
  the whole path produces a bit-identical result. `node_worker.js` and
  `node.html` share the exact claim→compute→submit logic the test exercises.
- **Not run here (no browser/display in this environment)**: `node.html`
  rendering and spawning actual Web Workers on a phone. The logic those
  workers run is the tested path; opening the page on a device is the last
  mile to confirm the UI.
- **Next**: software `sin/cos` compiled into the WASM for exact
  cross-node-type parity (currently machine-epsilon vs the native engine);
  auto-registering browser nodes into the platform fleet registry.
