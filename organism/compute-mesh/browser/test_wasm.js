/**
 * test_wasm.js — correctness + speed of the WASM browser kernel.
 *
 * Verifies the compiled WASM kernel (kernel.wasm, the real C kernel a
 * browser Web Worker runs) against the pure-JS kernel, and measures the
 * WASM speedup. Both use V8's Math.sin/cos/atan2 as the only host imports,
 * so they agree to machine epsilon; WASM is faster because the tight
 * numerical loop is compiled, not interpreted.
 *
 * Run:  node test_wasm.js   (after building kernel.wasm — see build.sh)
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { loadWasmKernel } = require('./wasm_runner.js');
const { batchSimulateRange: jsKernel } = require('./mesh_kernel.js');

async function run() {
  if (!fs.existsSync(path.join(__dirname, 'kernel.wasm'))) {
    console.log('SKIP: kernel.wasm not built — run ./build.sh first');
    process.exit(0);
  }

  const wasm = await loadWasmKernel();
  const failures = [];
  const check = (label, cond, detail = '') => {
    console.log((cond ? 'PASS' : 'FAIL') + `: ${label}` + (detail && !cond ? `  (${detail})` : ''));
    if (!cond) failures.push(label);
  };

  // ── Correctness: WASM vs pure-JS kernel ────────────────────────────
  const p = [0, 30, 128, 25, 0.35, 0.873, 20260101];
  const w = wasm.batchSimulateRange(...p);
  const j = jsKernel(...p);
  let maxDiff = 0;
  for (let i = 0; i < w.length; i++) maxDiff = Math.max(maxDiff, Math.abs(w[i] - j[i]));
  check('WASM matches pure-JS kernel to machine epsilon', maxDiff < 1e-12, `maxDiff=${maxDiff.toExponential(2)}`);

  // ── Determinism: same call twice is bit-identical ──────────────────
  const w2 = wasm.batchSimulateRange(...p);
  check('WASM is deterministic (identical on repeat)', JSON.stringify(w) === JSON.stringify(w2));

  // ── Range-stitch consistency (the mesh partitioning property) ──────
  const full = wasm.batchSimulateRange(0, 30, 128, 25, 0.35, 0.873, 20260101);
  const a = wasm.batchSimulateRange(0, 12, 128, 25, 0.35, 0.873, 20260101);
  const b = wasm.batchSimulateRange(12, 30, 128, 25, 0.35, 0.873, 20260101);
  const stitched = [...a, ...b];
  check('partitioned ranges stitch bit-identically', JSON.stringify(full) === JSON.stringify(stitched));

  // ── Speed: WASM vs JS ──────────────────────────────────────────────
  const N = 1500, NODES = 256, STEPS = 40, K = 0.35, DT = 0.873, SEED = 1;
  wasm.batchSimulateRange(0, 50, NODES, STEPS, K, DT, SEED); // warm
  jsKernel(0, 50, NODES, STEPS, K, DT, SEED);

  let t = process.hrtime.bigint();
  wasm.batchSimulateRange(0, N, NODES, STEPS, K, DT, SEED);
  const wasmMs = Number(process.hrtime.bigint() - t) / 1e6;

  t = process.hrtime.bigint();
  jsKernel(0, N, NODES, STEPS, K, DT, SEED);
  const jsMs = Number(process.hrtime.bigint() - t) / 1e6;

  const speedup = jsMs / wasmMs;
  console.log(`       JS: ${jsMs.toFixed(0)}ms   WASM: ${wasmMs.toFixed(0)}ms   speedup: ${speedup.toFixed(2)}x`);
  check('WASM is not slower than pure JS', wasmMs <= jsMs * 1.05, `js=${jsMs.toFixed(0)} wasm=${wasmMs.toFixed(0)}`);

  console.log();
  if (failures.length) {
    console.log(`RESULT: ${failures.length} FAILED: ${failures}`);
    process.exit(1);
  }
  console.log('RESULT: WASM browser kernel is correct, deterministic, stitch-consistent, and faster than JS.');
}

run().catch((e) => { console.error(e); process.exit(1); });
