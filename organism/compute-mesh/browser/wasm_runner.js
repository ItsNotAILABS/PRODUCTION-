/**
 * wasm_runner.js — loads kernel.wasm and exposes the same
 * batchSimulateRange() interface as mesh_kernel.js, but backed by the
 * compiled C kernel running at near-native speed.
 *
 * Works in Node (for tests/benchmarks) and in a browser Web Worker (its
 * real job). The only host imports the module needs are Math.sin/cos/atan2.
 *
 * Node usage:
 *   const { loadWasmKernel } = require('./wasm_runner.js');
 *   const k = await loadWasmKernel();               // finds kernel.wasm beside this file
 *   const out = k.batchSimulateRange(0, 100, 256, 20, 0.35, 0.873, 42);
 *
 * Browser usage: fetch the .wasm bytes and pass them in
 *   const k = await loadWasmKernel(await (await fetch('kernel.wasm')).arrayBuffer());
 */
'use strict';

const IMPORTS = {
  env: {
    sin: Math.sin,
    cos: Math.cos,
    atan2: Math.atan2,
  },
};

async function instantiate(bytesOrModule) {
  const { instance } = await WebAssembly.instantiate(bytesOrModule, IMPORTS);
  return instance;
}

/**
 * @param {ArrayBuffer|Uint8Array} [wasmBytes] explicit module bytes (browser).
 *   In Node, omit to auto-read kernel.wasm next to this file.
 */
async function loadWasmKernel(wasmBytes) {
  let bytes = wasmBytes;
  if (!bytes) {
    // Node path: read the file beside this module.
    const fs = require('fs');
    const path = require('path');
    bytes = fs.readFileSync(path.join(__dirname, 'kernel.wasm'));
  }
  const instance = await instantiate(bytes);
  const ex = instance.exports;
  const memory = ex.memory;
  const heapBase = ex.__heap_base ? ex.__heap_base.value : 0;
  const maxNodes = ex.kernel_max_nodes();

  function batchSimulateRange(begin, end, nodes, steps, coupling, dt, baseSeed) {
    const count = end - begin;
    if (count <= 0) return [];
    if (nodes > maxNodes) {
      throw new Error(`nodes=${nodes} exceeds kernel MAX_NODES=${maxNodes}`);
    }
    // Output goes at heapBase (above the module's static scratch buffers),
    // 8 bytes per double. Grow memory if the batch is large.
    const outPtr = heapBase;
    const neededBytes = outPtr + count * 8;
    const haveBytes = memory.buffer.byteLength;
    if (neededBytes > haveBytes) {
      const morePages = Math.ceil((neededBytes - haveBytes) / 65536);
      memory.grow(morePages);
    }
    const written = ex.simulate_range(
      begin, end, nodes, steps, coupling, dt, BigInt(baseSeed), outPtr,
    );
    // Re-view after a possible grow (grow can detach the old buffer).
    const view = new Float64Array(memory.buffer, outPtr, written);
    return Array.from(view);
  }

  return { batchSimulateRange, maxNodes };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadWasmKernel };
}
