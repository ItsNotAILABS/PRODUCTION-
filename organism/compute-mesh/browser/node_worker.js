/**
 * node_worker.js — a single Web Worker that computes mesh chunks.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * One of these runs per CPU core (node.html spawns navigator.hardware-
 * Concurrency of them). Its loop: claim a chunk from the mesh server →
 * compute it with the WASM kernel (falling back to the pure-JS kernel if
 * WASM won't load) → submit the results → repeat. When the queue is empty
 * it backs off and polls.
 *
 * Loaded via importScripts() from node.html, so it shares that origin and
 * can fetch the server's endpoints and static assets.
 */
'use strict';

/* eslint-disable no-undef */
importScripts('mesh_kernel.js');   // provides self.MeshKernel (pure-JS fallback)

let kernel = null;      // { batchSimulateRange }
let usingWasm = false;
let serverBase = '';
let nodeId = '';
let running = false;
let computed = 0;       // populations this worker has computed

async function initKernel() {
  // Try WASM first (near-native speed); fall back to pure JS.
  try {
    // wasm_runner.js is written for CommonJS/Node; in a Worker we inline the
    // essential loader to avoid module-system friction.
    const resp = await fetch('kernel.wasm');
    if (!resp.ok) throw new Error('kernel.wasm ' + resp.status);
    const bytes = await resp.arrayBuffer();
    const imports = { env: { sin: Math.sin, cos: Math.cos, atan2: Math.atan2 } };
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    const ex = instance.exports;
    const heapBase = ex.__heap_base ? ex.__heap_base.value : 0;
    const maxNodes = ex.kernel_max_nodes();
    kernel = {
      batchSimulateRange(begin, end, nodes, steps, coupling, dt, baseSeed) {
        const count = end - begin;
        if (count <= 0) return [];
        if (nodes > maxNodes) throw new Error('nodes exceed kernel max ' + maxNodes);
        const outPtr = heapBase;
        const needed = outPtr + count * 8;
        if (needed > ex.memory.buffer.byteLength) {
          ex.memory.grow(Math.ceil((needed - ex.memory.buffer.byteLength) / 65536));
        }
        const written = ex.simulate_range(begin, end, nodes, steps, coupling, dt, BigInt(baseSeed), outPtr);
        return Array.from(new Float64Array(ex.memory.buffer, outPtr, written));
      },
    };
    usingWasm = true;
  } catch (e) {
    kernel = { batchSimulateRange: self.MeshKernel.batchSimulateRange };
    usingWasm = false;
  }
  postMessage({ type: 'ready', usingWasm });
}

async function claim() {
  const r = await fetch(serverBase + '/mesh/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId }),
  });
  return r.json();
}

async function submit(jobId, chunkId, coherences) {
  await fetch(serverBase + '/mesh/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, chunk_id: chunkId, node_id: nodeId, coherences }),
  });
}

async function loop() {
  while (running) {
    let chunk;
    try {
      chunk = await claim();
    } catch (e) {
      await sleep(1000); continue;   // server hiccup — back off
    }
    if (chunk.empty) {
      await sleep(600); continue;    // nothing to do — poll
    }
    // Compute the chunk's global range. The JS/WASM batchSimulateRange
    // seeds each population by its GLOBAL index (baseSeed + p), so we pass
    // the plain job seed here — NOT seed + range_begin. (The native Python
    // worker adds range_begin because its kernel seeds by local index; the
    // two kernels parameterize seeding differently. Same global result.)
    const out = kernel.batchSimulateRange(
      chunk.range_begin, chunk.range_end, chunk.nodes, chunk.steps,
      chunk.coupling, chunk.dt, chunk.seed,
    );
    computed += out.length;
    try {
      await submit(chunk.job_id, chunk.chunk_id, out);
    } catch (e) { /* server will reclaim the lease and reissue */ }
    postMessage({ type: 'progress', computed, usingWasm });
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'start') {
    serverBase = m.serverBase || '';
    nodeId = m.nodeId;
    if (!kernel) await initKernel();
    if (!running) { running = true; loop(); }
  } else if (m.type === 'stop') {
    running = false;
  }
};
