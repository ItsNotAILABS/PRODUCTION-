/**
 * mesh_kernel.js — pure-JS Kuramoto batch kernel for browser compute nodes.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A browser can't load the native C++ engine (organism_native.so), so a
 * browser-based compute node needs its own implementation of the same
 * batch simulation. This is that implementation, written to match
 * organism/cpp/src/organism_parallel.cpp OPERATION-FOR-OPERATION:
 *
 *   - splitmix64 seeding replicated with BigInt (JS has no native uint64);
 *   - the same top-53-bits → [0,1) → [0,2π) phase construction;
 *   - the same mean-field step, same summation order, same Math.* calls
 *     in the same order as the C++ std::* calls.
 *
 * How close it gets to the native engine is an empirical question (V8's
 * libm vs glibc for sin/cos/hypot/atan2), answered by
 * test_kernel_parity.js — run it, don't assume. Runs in both Node (for
 * that test) and a browser Web Worker (its actual job), no dependencies.
 *
 * Works in CommonJS (Node test) and as a plain script (Web Worker) via
 * the guarded module.exports at the bottom.
 */
'use strict';

const TWO_PI = 2.0 * Math.PI;
const MASK64 = (1n << 64n) - 1n;
const INV_2P53 = 1.0 / 9007199254740992.0; // 1 / 2^53

// splitmix64, matching organism_parallel.cpp. `state` is a BigInt holder
// object { s: BigInt } so the mutation is visible to the caller (mirrors
// the C++ `uint64_t& s`).
function splitmix64(state) {
  state.s = (state.s + 0x9E3779B97F4A7C15n) & MASK64;
  let z = state.s;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

function nextPhase(state) {
  // top 53 bits of the 64-bit output → an exact integer in [0, 2^53)
  const top53 = splitmix64(state) >> 11n;
  const unit = Number(top53) * INV_2P53; // exact: top53 < 2^53 fits a double
  return unit * TWO_PI;
}

// One connectome to completion; returns final order parameter R.
function simulateOne(nodes, steps, coupling, dt, seed) {
  if (nodes === 0) return 0.0;

  const state = { s: BigInt.asUintN(64, BigInt(seed)) };
  let cur = new Float64Array(nodes);
  let nxt = new Float64Array(nodes);
  for (let i = 0; i < nodes; i++) cur[i] = nextPhase(state);

  for (let step = 0; step < steps; step++) {
    let sumCos = 0.0, sumSin = 0.0;
    for (let i = 0; i < nodes; i++) {
      sumCos += Math.cos(cur[i]);
      sumSin += Math.sin(cur[i]);
    }
    sumCos /= nodes;
    sumSin /= nodes;
    const r = Math.hypot(sumCos, sumSin);
    const psi = Math.atan2(sumSin, sumCos);

    for (let i = 0; i < nodes; i++) {
      const theta = cur[i];
      let v = (theta + coupling * r * Math.sin(psi - theta) * dt) % TWO_PI;
      if (v < 0.0) v += TWO_PI;
      nxt[i] = v;
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }

  let sumCos = 0.0, sumSin = 0.0;
  for (let i = 0; i < nodes; i++) {
    sumCos += Math.cos(cur[i]);
    sumSin += Math.sin(cur[i]);
  }
  return Math.hypot(sumCos / nodes, sumSin / nodes);
}

/**
 * Compute a GLOBAL population range [begin, end). Matches worker.py's
 * seed-offset convention: population p (global index) is seeded from
 * baseSeed + p, so a range computed here stitches bit-consistently with
 * ranges computed by the native worker.
 */
function batchSimulateRange(begin, end, nodes, steps, coupling, dt, baseSeed) {
  const out = new Array(end - begin);
  for (let p = begin; p < end; p++) {
    out[p - begin] = simulateOne(nodes, steps, coupling, dt, BigInt(baseSeed) + BigInt(p));
  }
  return out;
}

// Dual export: CommonJS for the Node parity test, global for a Web Worker.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitmix64, nextPhase, simulateOne, batchSimulateRange, TWO_PI };
} else if (typeof self !== 'undefined') {
  self.MeshKernel = { simulateOne, batchSimulateRange };
}
