# Sovereign Organism Runtime — Python

A living, phi-encoded organism with a 873 ms heartbeat, 4-register state architecture, kernel execution, edge sensing, and cross-organism resonance.

## Quick start

```bash
# Run directly (no install required, stdlib only)
python -m organism

# Or install and use the entry-point
pip install -e .
organism
```

## Architecture

| Component | Module | Purpose |
|-----------|--------|---------|
| **Constants** | `organism.constants` | PHI, GOLDEN_ANGLE, HEARTBEAT_MS |
| **State** | `organism.state` | Thread-safe 4-register store (cognitive / affective / somatic / sovereign) |
| **Heartbeat** | `organism.heartbeat` | 873 ms daemon pulse with beat callbacks |
| **Kernel** | `organism.kernel` | Load, schedule, and execute kernel functions with timeout |
| **Sensor** | `organism.sensor` | Edge sensing with thresholds and calibration |
| **Resonance** | `organism.resonance` | Cross-organism communication and synchronisation |
| **Vitality** | `organism.vitality` | Phi-weighted composite health score |
| **Physics** | `organism.physics` | Reactive formula graph (`Cell`/`formula`) + Kuramoto phase-coupling primitives |
| **NeuroEmergence** | `organism.neuroemergence` | Local simulation client mirroring the NeuroEmergence Core canister — no IC calls |

## Physics — reactive formulas and phase coupling

`organism.physics` provides two building blocks for simulations:

- **`Cell` / `formula`** — a spreadsheet-style reactive value. Set a source
  cell, derive others from it with `formula(lambda: ...)`, and every dependent
  recomputes lazily the next time it's read. A `Cell` can also wrap state
  outside the graph (a dict, a sensor reading) and be invalidated manually
  with `.invalidate()` when that external state changes.
- **Kuramoto primitives** — `kuramoto_step` (arbitrary pairwise coupling
  graph, matches PROTO-211's JS implementation exactly), `mean_field_kuramoto_step`
  (all-to-all population coupling, the model used by `NeuroEmergenceCore`),
  and `order_parameter` (the synchrony/"emergence" measure `R ∈ [0, 1]`).
- **`phi_decay`** — the same phi-weighted decay curve `organism.resonance`
  uses for peer signal strength, exposed as a standalone formula.

```python
from organism import Cell, formula, order_parameter

a = Cell(2, name="a")
b = formula(lambda: a.value * 2)
a.value = 5
b.value  # 10 — recomputed lazily on read
```

## NeuroEmergence Core — local simulation client

`organism.neuroemergence.NeuroEmergenceCore` mirrors the query/update surface
of the live NeuroEmergence Core canister (`q7ljb-jqaaa-aaaac-qam3a-cai`,
documented in `x-sovereign-mcp/src/ic/neurocore-idl.js`) but runs entirely
in-process — no IC calls, no chat credits. Useful for local dev and tests
against the same coherence math, neurochemical model, and training-protocol
surface without touching the live canister.

```python
from organism import NeuroEmergenceCore, PROTOCOL_IDS

core = NeuroEmergenceCore(node_count=96, seed=42)
core.inject_neurochemical("dopamine", 5.0)
core.run_protocol_training(PROTOCOL_IDS["AI_INTELLIGENCE"], ticks=200)
core.get_dashboard_snapshot()  # {"coherence": ..., "passing": ..., ...}
```

## Constants

```
PHI           = 1.618033988749895
GOLDEN_ANGLE  = 137.508
HEARTBEAT_MS  = 873
```

## Requirements

- Python ≥ 3.10
- No external dependencies — stdlib only
