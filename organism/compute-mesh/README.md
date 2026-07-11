# Aether Compute Mesh

Turns the single-node parallel batch engine
(`organism/cpp` → `organism_batch_simulate`) into a **distributed** one:
partition a batch of N independent Kuramoto populations across many
worker machines, compute the ranges in parallel, stitch the results back
together.

This is the step from "all cores on one box" to "many boxes" — the fleet
the Aether platform already models (Cloudflare Workers, ICP canisters,
bare-metal nodes) becomes the compute substrate.

## Two ways to attach a node: PUSH and PULL

The mesh supports both directions, because different machines can join in
different ways:

- **PUSH** (`worker.py` + `coordinator.py`) — the coordinator knows a set
  of worker URLs and *posts* ranges to them. Best for a fleet of machines
  you control with reachable addresses.
- **PULL** (`browser/mesh_server.py` + a pulling node) — the coordinator
  is a work *queue*; nodes *dial out*, claim a chunk, compute it, and
  submit the result. Best for machines with no inbound address — laptops,
  home servers behind NAT, phones. Two pulling nodes exist:
  - `browser/node.html` — any device that opens a page; computes in
    **WebAssembly**, one Web Worker per core. No toolchain needed.
  - `pull_worker.py` — a headless, persistent node that computes with the
    **native C++ engine** (fastest). The 24/7 desktop/server equivalent of
    a browser tab; dials out, so it works from behind NAT.

## Pieces

- **`worker.py`** — one PUSH compute node. A stdlib HTTP server that
  computes an assigned global population range using the native C++ engine
  and returns the coherences. Zero dependencies beyond the native library.
- **`coordinator.py`** — partitions a `BatchJob` across a set of worker
  URLs, dispatches the ranges concurrently, reassembles the ordered
  result, and falls back to local compute for any range whose worker fails.
- **`pull_worker.py`** — a headless native PULL node. Point it at a
  `mesh_server.py` coordinator (`--server URL`) and it claims → computes →
  submits until stopped. Runs concurrent claim loops (`--loops`) to overlap
  network I/O; splits cores across them. `test_pull_worker.py` proves it
  end-to-end (bit-identical drain + lease-reclaim on node death).
- **`browser/mesh_server.py`** — the PULL work queue, with **quorum result
  integrity** for open/public meshes (see below). Serves the browser node
  bundle too.
- **`test_mesh.py`** — spins up real PUSH worker processes and proves the
  whole thing (see "Verified" below).

## Result integrity on a public mesh

Once anyone can join and submit results, a single malicious node can
poison a job. The pull coordinator defends against this with **quorum
verification**: a job may set `quorum >= 2`, and a chunk is only trusted
once that many *independent* nodes return results that **agree within a
tolerance** (~1e-9 — honest nodes agree to machine epsilon within a kernel
and ~1e-9 across native/WASM/JS; a poisoner's values are nowhere close).
Every disagreeing submission pulls in one more replica; a chunk that can't
reach agreement is marked `contested` and **fails loudly** rather than
returning corrupt data — losing nodes are flagged for reputation. Default
`quorum` is 1 (trusting) for a closed mesh of workers you control.
`browser/test_quorum_integrity.py` proves a lone poisoner corrupts a
quorum-1 job but is outvoted and flagged under quorum-3.

## The correctness key

The native engine seeds population `p` deterministically from
`base_seed + p` and populations never interact. So a worker assigned
global range `[begin, end)` calls the engine with `seed = base_seed +
begin` — its local indices `0..(end-begin)` then map to exactly the same
per-population seeds the monolithic single-node run would use. The
stitched-together distributed result is therefore **bit-identical** to a
single-machine `batch_simulate` of the whole job. Distribution is a
pure scale win — it never changes the answer. `test_mesh.py` asserts
this against a real single-node reference on every run.

## Verified (actually run, not asserted)

`test_mesh.py` spins up **3 real worker processes** (separate OS
processes, real HTTP over localhost — no mocks) and checks:

- distributed result is **bit-identical** to a single-node run;
- work genuinely **spread across multiple worker nodes**;
- **resilience**: kill a worker, and its range is transparently
  recomputed (on the local engine) — the result stays **complete and
  bit-identical**, a dead node costs throughput, not correctness;
- **no-workers fallback**: with an empty pool the coordinator computes
  the whole job locally and stays correct.

All 10 checks pass.

## Run it

```bash
# build the native engine once
cd organism/cpp && cmake -B build . && cmake --build build

# start workers (one terminal each, or backgrounded)
cd organism/compute-mesh
python3 worker.py --port 8801
python3 worker.py --port 8802

# drive them from Python
python3 - <<'PY'
from coordinator import BatchJob, MeshCoordinator
coord = MeshCoordinator(["http://127.0.0.1:8801", "http://127.0.0.1:8802"])
job = BatchJob(population_count=10000, nodes_per_population=512, steps=50,
               coupling=0.35, dt=0.873, seed=1)
res = coord.run(job)
print("nodes used:", {a["node"] for a in res.assignments})
print("bit-identical to single-node:", coord.verify_against_local(job, res))
PY
```

## Honest scope — where the speedup actually comes from

On a **single machine**, the mesh does *not* make a batch faster — every
worker process shares the same physical cores, and you add HTTP overhead
on top. The single-node parallel engine (`batch_simulate` with
`threads=-1`) is already the fastest way to use one box.

What the mesh adds is the **architecture to scale past one box**: point
the worker URLs at different physical machines and the same job's
population range splits across them, so total throughput grows with the
number of machines, not just the cores in one. The correctness and
resilience guarantees above are what make that safe to do.

- **Proven**: correct range-partitioning, real HTTP distribution across
  separate processes (both PUSH and PULL), dead-worker/vanished-node
  reclaim, bit-identical results, and **poison resistance via quorum** —
  all on localhost worker processes.
- **Not yet done**: automatic worker discovery from the Aether platform's
  fleet registry (right now you pass worker URLs, or point pull nodes at a
  coordinator), a console button to submit mesh jobs, queue persistence
  across a coordinator restart (state is in-memory today), and a real
  multi-machine benchmark (needs more than one host — can't be run from
  this single-box environment). The localhost tests prove the transport,
  the math, and the integrity model; multi-machine throughput scaling is
  the same code with different URLs.
