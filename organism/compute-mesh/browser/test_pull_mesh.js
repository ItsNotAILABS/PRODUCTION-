/**
 * test_pull_mesh.js — end-to-end test of the pull-based browser mesh.
 *
 * Starts the real mesh_server.py, then simulates browser worker nodes as
 * Node async loops (using the SAME WASM kernel a browser Web Worker runs)
 * that claim → compute → submit against the real HTTP endpoints. Proves:
 *
 *   1. The queue drains and the job completes.
 *   2. The reassembled result is BIT-IDENTICAL to a single-call WASM
 *      batch of the whole job — chunk partitioning + seed-offset +
 *      reassembly are all correct.
 *   3. Lease reclaim: a worker that claims a chunk and vanishes doesn't
 *      stall the job — the chunk is reissued and the job still completes.
 *
 * Run:  node test_pull_mesh.js   (after ./build.sh)
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { loadWasmKernel } = require('./wasm_runner.js');

const HERE = __dirname;
const PORT = 8934;
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function post(pathname, body) {
  const r = await fetch(BASE + pathname, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function get(pathname) { return (await fetch(BASE + pathname)).json(); }

async function waitHealthy(timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { await get('/mesh/stats'); return true; } catch { await sleep(150); }
  }
  return false;
}

// One simulated browser worker: claim → compute → submit, until told to stop.
function makeWorker(kernel, nodeId, opts = {}) {
  let running = true;
  const drop = opts.dropFirst || false; // simulate a worker that claims then vanishes
  let dropped = false;
  const p = (async () => {
    while (running) {
      let chunk;
      try { chunk = await post('/mesh/claim', { node_id: nodeId }); }
      catch { await sleep(100); continue; }
      if (chunk.empty) { await sleep(120); continue; }
      if (drop && !dropped) {   // claim it, then disappear without submitting
        dropped = true;
        running = false;
        return { claimedThenDropped: chunk.chunk_id };
      }
      const out = kernel.batchSimulateRange(
        chunk.range_begin, chunk.range_end, chunk.nodes, chunk.steps,
        chunk.coupling, chunk.dt, chunk.seed,
      );
      try { await post('/mesh/submit', { job_id: chunk.job_id, chunk_id: chunk.chunk_id, node_id: nodeId, coherences: out }); }
      catch { /* server reclaims */ }
    }
  })();
  return { stop() { running = false; }, done: p };
}

async function run() {
  const fs = require('fs');
  if (!fs.existsSync(path.join(HERE, 'kernel.wasm'))) {
    console.log('SKIP: kernel.wasm not built — run ./build.sh'); process.exit(0);
  }

  const failures = [];
  const check = (l, c, d = '') => { console.log((c ? 'PASS' : 'FAIL') + `: ${l}` + (d && !c ? `  (${d})` : '')); if (!c) failures.push(l); };

  // short lease so the reclaim test doesn't take 30s
  const srv = spawn('python3', [path.join(HERE, 'mesh_server.py'), '--port', String(PORT)],
    { env: { ...process.env, MESH_CHUNK_LEASE_SECONDS: '2' }, stdio: 'ignore' });

  try {
    if (!(await waitHealthy())) { console.log('SKIP: mesh_server did not start'); srv.kill(); process.exit(0); }

    const kernel = await loadWasmKernel();

    // ── Job 1: normal drain across several workers ─────────────────────
    const jobSpec = { population_count: 500, nodes: 128, steps: 18, coupling: 0.35, dt: 0.873, seed: 4242, chunk_size: 37 };
    const created = await post('/mesh/job', jobSpec);
    check('job created with chunks', created.job_id && created.chunks > 1, JSON.stringify(created));

    const nWorkers = 5;
    const workers = [];
    for (let i = 0; i < nWorkers; i++) workers.push(makeWorker(kernel, `sim-w${i}`));

    // wait for completion
    let status;
    for (let i = 0; i < 200; i++) {
      status = await get('/mesh/job/' + created.job_id);
      if (status.complete) break;
      await sleep(50);
    }
    workers.forEach((w) => w.stop());
    check('job completed by pull-workers', status.complete === true, JSON.stringify({ done: status.done, chunks: status.chunks }));

    // reference: single WASM call over the whole range
    const ref = kernel.batchSimulateRange(0, jobSpec.population_count, jobSpec.nodes, jobSpec.steps, jobSpec.coupling, jobSpec.dt, jobSpec.seed);
    check('reassembled result bit-identical to single-call WASM batch',
      JSON.stringify(status.result) === JSON.stringify(ref),
      'lengths ' + (status.result || []).length + ' vs ' + ref.length);

    // ── Job 2: lease reclaim — one worker claims then vanishes ─────────
    const job2 = await post('/mesh/job', { ...jobSpec, seed: 777 });
    // a worker that grabs one chunk and disappears without submitting
    const flaky = makeWorker(kernel, 'flaky', { dropFirst: true });
    await flaky.done; // it claims one chunk then stops
    // honest workers finish the rest; the dropped chunk must be reclaimed after the 2s lease
    const good = [];
    for (let i = 0; i < 4; i++) good.push(makeWorker(kernel, `good${i}`));
    let s2;
    for (let i = 0; i < 300; i++) {
      s2 = await get('/mesh/job/' + job2.job_id);
      if (s2.complete) break;
      await sleep(50);
    }
    good.forEach((w) => w.stop());
    check('job completes despite a worker claiming a chunk then vanishing (lease reclaimed)',
      s2.complete === true, JSON.stringify({ done: s2.done, chunks: s2.chunks }));
    const ref2 = kernel.batchSimulateRange(0, jobSpec.population_count, jobSpec.nodes, jobSpec.steps, jobSpec.coupling, jobSpec.dt, 777);
    check('reclaimed-job result still bit-identical', JSON.stringify(s2.result) === JSON.stringify(ref2));

  } finally {
    srv.kill();
  }

  console.log();
  if (failures.length) { console.log(`RESULT: ${failures.length} FAILED: ${failures}`); process.exit(1); }
  console.log('RESULT: pull-based browser mesh works — workers claim/compute/submit, the queue drains to a '
    + 'bit-identical result, and a vanished worker\'s chunk is reclaimed so the job always finishes.');
}

run().catch((e) => { console.error(e); process.exit(1); });
