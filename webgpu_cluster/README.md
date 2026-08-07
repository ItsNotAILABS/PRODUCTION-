# WebGPU Compute Cluster

A browser tab becomes a GPU compute node. `node.html` opens a WebGPU device, compiles a
register-blocked tiled matmul (WGSL), and can either benchmark locally or pull jobs from a
coordinator so many tabs form a cluster.

## Measured, on real silicon

Verified on a **Qualcomm Adreno 7xx** (phone-class GPU), not simulated:

| measurement | result |
|---|---|
| correctness (100×100, non-tile-aligned, vs CPU reference) | max abs diff ~2.4e-6, PASS every run |
| peak single-call, 1024² | 100–172 GFLOP/s |
| compute-only (excl. upload/readback) | up to 226 GFLOP/s |
| steady state, buffers reused | up to 299 GFLOP/s |
| per-call overhead at 1024² | 12–18% of wall time (upload ~3.2ms + readback ~1.5ms) |

Throughput swings widely run-to-run because Adreno's clock governor ramps under sustained load
and decays within seconds of idling. Any single benchmark number is a snapshot, not a spec —
which is why the sweep reports medians and ranges rather than a best-of.

## Two corrections worth keeping

**The config sweep was originally invalid.** v1 timed each register-block config as a sequential
block. Under DVFS that measures clock state, not kernel quality: across 5 real runs it named 3
different winners for the same 4 kernels, with more spread *within* a config (132–172) than
*between* configs. The current version round-robin interleaves configs across rounds and only
declares a winner if its median clears the runner-up's best case. Honest conclusion on this
hardware: TM4×4/BK8, TM2×2/BK8 and BK16 are statistically indistinguishable; only TM8×8 is
consistently worse (register pressure).

**The wire protocol was the bottleneck, not the network.** Matrices originally travelled as JSON
number lists. At 1024² that turned ~15ms of compute into ~3.2s of round trip, almost entirely
text serialize/parse. Base64 little-endian float32 cut it to ~270ms — about 12× — for identical
results.

## Buttons

- **Run local benchmark** — correctness check first (aborts if it fails), then 256/512/1024.
- **Profile hardware** — overhead breakdown, buffer-reuse ceiling, the GPU-resident vs
  round-tripped chain A/B, and the DVFS-fair config sweep.
- **Join cluster** — worker loop against `coordinator.py`. Needs the real file over `file://` or
  a local server; a sandboxed artifact iframe blocks the outbound request.

## Provenance of this file

Recovered from a published artifact after the build container was reclaimed. The artifact remains
a durable copy:

- Compute node: https://claude.ai/code/artifact/081412b4-bde9-45f8-b785-56c32d59cbe1
- Industry slate: https://claude.ai/code/artifact/ca7e1e2f-06cc-4fdd-8ec6-148c39cf705e

## Not in this directory yet

`coordinator.py` and the `gpu_program.js` / `gpu_program.py` op-graph runtime were built in an
ephemeral workspace and exist only in delivered archives. They belong here alongside `node.html`.
