"""
Aether Fleet Manager — sovereign multi-target orchestration registry.

Equivalent role to SUSE Rancher's cluster registry + Fleet controller,
but for Cloudflare Workers, ICP canisters, Lambda, and bare metal.
No Kubernetes. No YAML clusters. Targets self-register.
"""
from __future__ import annotations

import time
import math
from typing import Dict, List, Optional, Tuple

from .targets import Target, TargetClass, TargetStatus

PHI     = 1.618033988749895
PHI_INV = 0.618033988749895
HEARTBEAT_S = 0.873


class FleetManager:
    """
    Central registry of all deployment targets in the sovereign fleet.

    Phi-weighted scheduling ensures highest-score targets receive deploys first.
    Kuramoto-inspired coherence check confirms fleet is synchronised before
    rolling deploys.
    """

    def __init__(self) -> None:
        self._targets: Dict[str, Target] = {}
        self._deploy_history: List[dict] = []
        self._global_phi_score: float = 1.0
        self._beat: int = 0

    # ── Target lifecycle ──────────────────────────────────────────────────────

    def register(self, target: Target) -> None:
        self._targets[target.target_id] = target

    def deregister(self, target_id: str) -> bool:
        if target_id in self._targets:
            self._targets[target_id].status = TargetStatus.DECOMMISSIONED
            del self._targets[target_id]
            return True
        return False

    def heartbeat(self, target_id: str, latency_ms: float = 0.0) -> bool:
        t = self._targets.get(target_id)
        if t is None:
            return False
        t.record_heartbeat(latency_ms)
        return True

    # ── Fleet queries ─────────────────────────────────────────────────────────

    @property
    def targets(self) -> List[Target]:
        return list(self._targets.values())

    @property
    def healthy_targets(self) -> List[Target]:
        return [t for t in self._targets.values() if t.is_alive and t.status == TargetStatus.HEALTHY]

    def targets_by_class(self, cls: TargetClass) -> List[Target]:
        return [t for t in self.healthy_targets if t.target_class == cls]

    def get(self, target_id: str) -> Optional[Target]:
        return self._targets.get(target_id)

    # ── Phi-weighted scheduling ───────────────────────────────────────────────

    def rank_targets(self, workload_labels: Optional[Dict[str, str]] = None) -> List[Tuple[Target, float]]:
        """
        Rank all healthy targets by phi-weighted score.
        Score = phi_score * label_affinity_bonus.
        """
        ranked = []
        for t in self.healthy_targets:
            score = t.phi_score
            if workload_labels:
                matches = sum(1 for k, v in workload_labels.items() if t.labels.get(k) == v)
                score *= PHI ** matches
            ranked.append((t, score))
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked

    def best_target(self, workload_labels: Optional[Dict[str, str]] = None) -> Optional[Target]:
        ranked = self.rank_targets(workload_labels)
        return ranked[0][0] if ranked else None

    # ── Fleet coherence ───────────────────────────────────────────────────────

    def coherence(self) -> float:
        """
        Fleet coherence R ∈ [0,1]: ratio of healthy to total registered targets.
        Analogous to the Kuramoto order parameter — measures how 'in sync'
        the fleet is. R < 0.5 triggers a deploy freeze.
        """
        total = len(self._targets)
        if total == 0:
            return 0.0
        healthy = sum(1 for t in self._targets.values() if t.is_alive)
        return healthy / total

    def is_coherent(self) -> bool:
        return self.coherence() >= PHI_INV  # 0.618 threshold

    # ── Deploy recording ──────────────────────────────────────────────────────

    def record_deploy(self, target_id: str, workload_id: str, success: bool) -> None:
        t = self._targets.get(target_id)
        entry = {
            "beat":       self._beat,
            "ts":         time.time(),
            "target_id":  target_id,
            "workload_id": workload_id,
            "success":    success,
        }
        self._deploy_history.append(entry)
        if t:
            if success:
                if workload_id not in t.deployed_workloads:
                    t.deployed_workloads.append(workload_id)
                t.phi_score = min(PHI, t.phi_score * PHI)
            else:
                t.phi_score = max(0.01, t.phi_score * PHI_INV)
        self._beat += 1

    def deploy_history(self, limit: int = 50) -> List[dict]:
        return self._deploy_history[-limit:]

    # ── Fleet snapshot ────────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        healthy = self.healthy_targets
        return {
            "beat":              self._beat,
            "total_targets":     len(self._targets),
            "healthy_targets":   len(healthy),
            "coherence":         round(self.coherence(), 4),
            "is_coherent":       self.is_coherent(),
            "global_phi_score":  round(self._global_phi_score, 4),
            "targets_by_class":  {
                cls.value: len([t for t in healthy if t.target_class == cls])
                for cls in TargetClass
            },
            "targets": [t.to_dict() for t in self._targets.values()],
        }
