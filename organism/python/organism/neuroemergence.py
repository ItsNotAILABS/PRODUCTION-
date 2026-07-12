"""NeuroEmergence Core — local simulation client.

Mirrors the query/update surface of the live NeuroEmergence Core canister
(`q7ljb-jqaaa-aaaac-qam3a-cai`, https://neuroemergence-core-z8z.caffeine.xyz)
documented in x-sovereign-mcp/src/ic/neurocore-idl.js, but runs entirely
in-process — no IC calls, no chat credits, safe for local dev and tests.
Built on the reactive `Cell` graph and Kuramoto primitives in `physics.py` so
the synchrony math stays numerically identical to PROTO-211 and the canister
(96-node connectome, coupling strength K = PHI_INV, coherence target 0.87).
"""
from __future__ import annotations

import math
import random
import threading
import time
from dataclasses import dataclass, field

from .constants import HEARTBEAT_SECONDS, PHI
from .physics import Cell, mean_field_kuramoto_step, order_parameter, phi_decay

PHI_INV: float = 1.0 / PHI
COHERENCE_TARGET: float = 0.87

# The 24 neurochemicals (mirrors NEUROCHEMICALS in neurocore-idl.js)
NEUROCHEMICALS: tuple[str, ...] = (
    "dopamine", "serotonin", "norepinephrine", "acetylcholine", "gaba",
    "glutamate", "oxytocin", "cortisol", "melatonin", "adenosine",
    "anandamide", "substance_p", "neuropeptide_y", "endorphin", "enkephalin",
    "dynorphin", "crf", "vasopressin", "bdnf", "ngf",
    "il6", "tnf_alpha", "nitric_oxide", "histamine",
)

# Protocol IDs for run_protocol_training (mirrors PROTOCOL_IDS in neurocore-idl.js)
PROTOCOL_IDS: dict[str, int] = {
    "AI_INTELLIGENCE": 0,
    "MILITARY": 1,
    "RESEARCH": 2,
    "COMMERCIALIZATION": 3,
}

# Coupling bias applied per protocol during run_protocol_training — distinct
# training emphases nudge connectome synchrony differently rather than identically.
_PROTOCOL_COUPLING_BIAS: dict[int, float] = {0: 1.05, 1: 0.95, 2: 1.0, 3: 1.02}


@dataclass
class NeurochemicalState:
    level: float = 1.0  # baseline concentration, micromolar
    last_dose_at: float = field(default_factory=time.monotonic)


class NeuroEmergenceCore:
    """Local stand-in for the NeuroEmergence Core canister's simulation surface."""

    def __init__(self, node_count: int = 96, seed: int | None = None) -> None:
        rng = random.Random(seed)
        self._lock = threading.Lock()
        self._beat = 0
        self._node_ids = [f"n{i}" for i in range(node_count)]
        self._phases: dict[str, float] = {nid: rng.uniform(0, 2 * math.pi) for nid in self._node_ids}
        self._activities: dict[str, float] = {nid: 0.5 for nid in self._node_ids}
        self._coupling: float = PHI_INV
        self._chemicals: dict[str, NeurochemicalState] = {name: NeurochemicalState() for name in NEUROCHEMICALS}
        self._protocol_runs: dict[int, int] = {pid: 0 for pid in PROTOCOL_IDS.values()}
        self._coherence_cell: Cell[float] = Cell(self._compute_coherence, name="global_coherence")

    # -- queries ----------------------------------------------------------

    def compute_global_coherence(self) -> float:
        """Kuramoto order parameter R over the connectome — target >= 0.87."""
        with self._lock:
            return self._coherence_cell.value

    def get_routing_efficiency(self) -> float:
        """Mirrors compute_global_coherence — per canister docs, the two should match."""
        return self.compute_global_coherence()

    def get_heartbeat_status(self) -> dict:
        with self._lock:
            return {"beat": self._beat, "intervalMs": HEARTBEAT_SECONDS * 1000, "lastBeatAt": time.time()}

    def get_neurochemical_levels(self, filter: str | None = None) -> dict[str, float]:
        with self._lock:
            self._decay_chemicals()
            levels = {name: round(state.level, 6) for name, state in self._chemicals.items()}
        if filter:
            if filter not in levels:
                raise KeyError(f"Unknown chemical {filter!r}. Options: {', '.join(NEUROCHEMICALS)}")
            return {filter: levels[filter]}
        return levels

    def get_connectome_state(self) -> dict:
        with self._lock:
            return {
                "nodeCount": len(self._node_ids),
                "couplingStrength": self._coupling,
                "phases": dict(self._phases),
            }

    def get_dashboard_snapshot(self) -> dict:
        coherence = self.compute_global_coherence()
        with self._lock:
            beat = self._beat
            protocol_runs = dict(self._protocol_runs)
        return {
            "coherence": coherence,
            "passing": coherence >= COHERENCE_TARGET,
            "beat": beat,
            "nodeCount": len(self._node_ids),
            "neurochemicals": self.get_neurochemical_levels(),
            "protocolRuns": protocol_runs,
        }

    # -- updates ------------------------------------------------------------

    def inject_neurochemical(self, chemical: str, dose: float) -> dict:
        """Apply a Hill-equation-style dose response, then invalidate coherence (mirrors NEUROCORE_UPDATES.injectNeurochemical)."""
        if chemical not in self._chemicals:
            raise KeyError(f"Unknown chemical {chemical!r}. Options: {', '.join(NEUROCHEMICALS)}")
        if not (0.0 <= dose <= 10.0):
            raise ValueError("dose must be between 0.0 and 10.0 micromolar")
        with self._lock:
            state = self._chemicals[chemical]
            response = dose / (dose + PHI)  # Hill equation, n=1: saturates as dose grows
            state.level = min(10.0, state.level + response)
            state.last_dose_at = time.monotonic()
            for nid in self._node_ids:
                self._activities[nid] = max(0.05, min(1.0, self._activities[nid] + response * 0.05))
            self._coherence_cell.invalidate()
            new_level = round(state.level, 6)
        return {"chemical": chemical, "dose": dose, "newLevel": new_level}

    def trigger_heartbeat(self) -> dict:
        """Advance the connectome by one 873ms tick (mirrors PROTO-211's step())."""
        with self._lock:
            self._beat += 1
            self._phases = mean_field_kuramoto_step(self._phases, self._activities, self._coupling, dt=HEARTBEAT_SECONDS)
            self._decay_chemicals()
            self._coherence_cell.invalidate()
            coherence = self._coherence_cell.value
            beat = self._beat
        return {"beat": beat, "coherence": coherence}

    def run_protocol_training(self, protocol_id: int, ticks: int) -> dict:
        """Run `ticks` heartbeats, biasing connectome coupling per protocol (mirrors NEUROCORE_UPDATES.runProtocolTraining)."""
        if protocol_id not in PROTOCOL_IDS.values():
            raise ValueError(f"protocolId must be one of {sorted(PROTOCOL_IDS.values())}")
        if not (1 <= ticks <= 1000):
            raise ValueError("ticks must be between 1 and 1000")
        bias = _PROTOCOL_COUPLING_BIAS[protocol_id]
        with self._lock:
            self._coupling = min(1.0, self._coupling * bias)
        for _ in range(ticks):
            self.trigger_heartbeat()
        with self._lock:
            self._protocol_runs[protocol_id] += ticks
            total_runs = self._protocol_runs[protocol_id]
            coherence = self._coherence_cell.value
        return {"protocolId": protocol_id, "ticksRun": ticks, "totalRuns": total_runs, "coherence": coherence}

    def reset_connectome(self, seed: int | None = None) -> dict:
        """Reset every phase to a fresh random configuration (mirrors NEUROCORE_UPDATES.resetConnectome)."""
        rng = random.Random(seed)
        with self._lock:
            self._beat = 0
            self._phases = {nid: rng.uniform(0, 2 * math.pi) for nid in self._node_ids}
            self._activities = {nid: 0.5 for nid in self._node_ids}
            self._coherence_cell.invalidate()
            node_count = len(self._node_ids)
        return {"reset": True, "nodeCount": node_count}

    # -- internals ------------------------------------------------------

    def _compute_coherence(self) -> float:
        r, _psi = order_parameter(self._phases.values())
        return r

    def _decay_chemicals(self) -> None:
        """Caller must hold self._lock."""
        now = time.monotonic()
        for state in self._chemicals.values():
            age = now - state.last_dose_at
            if age > 0 and state.level > 1.0:
                state.level = 1.0 + phi_decay(state.level - 1.0, age)
