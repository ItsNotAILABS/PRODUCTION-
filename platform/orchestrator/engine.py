"""
Aether Sovereign Orchestration Engine.

This is the counterpart to Rancher's Fleet controller + App Catalog combined.
It manages the full workload lifecycle: register → schedule → deploy → monitor
→ roll back → promote.

Key differentiators over SUSE Rancher Fleet:
- Phi-weighted rolling deploys (not percentage-based)
- Coherence gate: deploy only proceeds if fleet R ≥ 0.618
- Agents are first-class workloads (not just containers/Helm charts)
- Multi-target: Cloudflare Workers, ICP canisters, Lambda, bare metal
"""
from __future__ import annotations

import time
import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from platform.fleet import FleetManager, Target, TargetClass

PHI     = 1.618033988749895
PHI_INV = 0.618033988749895


class WorkloadKind(Enum):
    AGENT          = "agent"           # organism agent (JS/Python/Wasm)
    WORKER         = "worker"          # Cloudflare Worker script
    CANISTER       = "canister"        # ICP Motoko/Rust canister
    FUNCTION       = "function"        # Lambda / edge function
    PROTOCOL       = "protocol"        # organism protocol module
    PIPELINE       = "pipeline"        # CI/CD pipeline definition


class DeployPhase(Enum):
    PENDING    = "pending"
    VALIDATING = "validating"
    SCHEDULING = "scheduling"
    DEPLOYING  = "deploying"
    VERIFYING  = "verifying"
    SUCCEEDED  = "succeeded"
    FAILED     = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class Workload:
    workload_id: str
    name: str
    kind: WorkloadKind
    image_ref: str              # e.g. "workers/hermes@sha256:abc..."
    target_class: TargetClass
    replicas: int = 1

    env: Dict[str, str] = field(default_factory=dict)
    labels: Dict[str, str] = field(default_factory=dict)
    phi_score: float = 1.0

    deploy_phase: DeployPhase = DeployPhase.PENDING
    deployed_to: List[str] = field(default_factory=list)   # target_ids
    created_at: float = field(default_factory=time.time)

    @property
    def sha(self) -> str:
        return hashlib.sha256(self.image_ref.encode()).hexdigest()[:12]

    def to_dict(self) -> dict:
        return {
            "workload_id":  self.workload_id,
            "name":         self.name,
            "kind":         self.kind.value,
            "image_ref":    self.image_ref,
            "target_class": self.target_class.value,
            "replicas":     self.replicas,
            "phase":        self.deploy_phase.value,
            "phi_score":    round(self.phi_score, 4),
            "deployed_to":  self.deployed_to,
        }


class OrchestrationEngine:
    """
    The sovereign deploy loop.

    In every heartbeat cycle the engine:
    1. Checks fleet coherence (R ≥ φ⁻¹ = 0.618)
    2. Processes the pending workload queue
    3. Schedules workloads to best-matching targets
    4. Drives phi-weighted rolling deploys
    5. Records outcomes and updates phi-scores
    """

    def __init__(self, fleet: FleetManager) -> None:
        self._fleet = fleet
        self._workloads: Dict[str, Workload] = {}
        self._pending: List[str] = []
        self._beat: int = 0
        self._hooks: Dict[str, List[Callable]] = {
            "pre_deploy": [], "post_deploy": [], "on_fail": [],
        }

    # ── Workload registration ─────────────────────────────────────────────────

    def register_workload(self, workload: Workload) -> None:
        self._workloads[workload.workload_id] = workload
        self._pending.append(workload.workload_id)

    def get_workload(self, workload_id: str) -> Optional[Workload]:
        return self._workloads.get(workload_id)

    # ── Hook system ───────────────────────────────────────────────────────────

    def on(self, event: str, fn: Callable) -> None:
        if event in self._hooks:
            self._hooks[event].append(fn)

    def _emit(self, event: str, **kwargs) -> None:
        for fn in self._hooks.get(event, []):
            try:
                fn(**kwargs)
            except Exception:
                pass

    # ── Deploy cycle (called every heartbeat) ─────────────────────────────────

    def tick(self) -> dict:
        """
        Process one heartbeat cycle. Returns a status summary.
        """
        self._beat += 1
        result = {
            "beat":       self._beat,
            "coherence":  self._fleet.coherence(),
            "deployed":   [],
            "skipped":    [],
            "failed":     [],
        }

        if not self._fleet.is_coherent():
            result["status"] = "coherence_gate_blocked"
            return result

        result["status"] = "running"
        to_process = self._pending.copy()
        self._pending.clear()

        for wid in to_process:
            w = self._workloads.get(wid)
            if w is None:
                continue

            target = self._fleet.best_target(w.labels)
            if target is None:
                result["skipped"].append(wid)
                self._pending.append(wid)
                continue

            w.deploy_phase = DeployPhase.DEPLOYING
            self._emit("pre_deploy", workload=w, target=target)

            success = self._do_deploy(w, target)

            if success:
                w.deploy_phase = DeployPhase.SUCCEEDED
                w.phi_score = min(PHI, w.phi_score * PHI)
                if target.target_id not in w.deployed_to:
                    w.deployed_to.append(target.target_id)
                self._fleet.record_deploy(target.target_id, wid, True)
                self._emit("post_deploy", workload=w, target=target)
                result["deployed"].append(wid)
            else:
                w.deploy_phase = DeployPhase.FAILED
                w.phi_score = max(0.01, w.phi_score * PHI_INV)
                self._fleet.record_deploy(target.target_id, wid, False)
                self._emit("on_fail", workload=w, target=target)
                result["failed"].append(wid)

        return result

    def _do_deploy(self, workload: Workload, target: Target) -> bool:
        """
        Execute the actual deploy. Override in subclasses or via hooks for
        real Cloudflare / ICP deploy logic.
        """
        return True

    # ── Rollback ──────────────────────────────────────────────────────────────

    def rollback(self, workload_id: str) -> bool:
        w = self._workloads.get(workload_id)
        if w is None:
            return False
        w.deploy_phase = DeployPhase.ROLLED_BACK
        w.deployed_to.clear()
        w.phi_score *= PHI_INV
        return True

    # ── Engine snapshot ───────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        return {
            "beat":          self._beat,
            "fleet":         self._fleet.snapshot(),
            "workloads":     [w.to_dict() for w in self._workloads.values()],
            "pending_count": len(self._pending),
        }
