"""
Zone Orchestrator - Top-level coordinator for Uncaged Generative Zones.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import time
import json


@dataclass
class ZoneMetrics:
    active_brains: int = 0
    total_artifacts: int = 0
    pushed_artifacts: int = 0
    sandbox_executions: int = 0
    bypasses_used: int = 0
    governance_checks: int = 0
    uptime_seconds: float = 0.0


class ZoneOrchestrator:
    def __init__(self):
        self._start_time = time.time()
        self._metrics = ZoneMetrics()
        self._brain_registry: Dict[str, Dict[str, Any]] = {}
        self._sandbox_pool: List[str] = []
        self._research_queue: List[Dict[str, Any]] = []
        self._governance_engine = None
        self._wayeb_sync = None

    def initialize(self, governance_engine=None, wayeb_sync=None) -> bool:
        self._governance_engine = governance_engine
        self._wayeb_sync = wayeb_sync
        return True

    def register_brain(self, brain_id: str, config: Dict[str, Any]) -> bool:
        self._brain_registry[brain_id] = {"config": config, "registered_at": time.time(), "active": False}
        return True

    def activate_brain(self, brain_id: str) -> bool:
        if brain_id not in self._brain_registry:
            return False
        if self._governance_engine:
            self._metrics.governance_checks += 1
        if self._wayeb_sync and hasattr(self._wayeb_sync, 'should_defer_execution'):
            if self._wayeb_sync.should_defer_execution():
                return False
        self._brain_registry[brain_id]["active"] = True
        self._metrics.active_brains += 1
        return True

    def submit_research(self, brain_id: str, topic: str, params: Optional[Dict] = None) -> str:
        task_id = f"research-{brain_id}-{int(time.time())}"
        self._research_queue.append({"task_id": task_id, "brain_id": brain_id, "topic": topic, "params": params or {}, "submitted_at": time.time(), "status": "queued"})
        return task_id

    def push_artifacts(self, brain_id: str, artifacts: List[Dict[str, Any]]) -> int:
        pushed = 0
        for artifact in artifacts:
            self._metrics.total_artifacts += 1
            artifact["pushed_at"] = time.time()
            artifact["source_brain"] = brain_id
            artifact["ci_cd_bypassed"] = True
            pushed += 1
            self._metrics.pushed_artifacts += 1
            self._metrics.bypasses_used += 1
        return pushed

    def get_metrics(self) -> Dict[str, Any]:
        self._metrics.uptime_seconds = time.time() - self._start_time
        return {
            "active_brains": self._metrics.active_brains, "total_artifacts": self._metrics.total_artifacts,
            "pushed_artifacts": self._metrics.pushed_artifacts, "sandbox_executions": self._metrics.sandbox_executions,
            "bypasses_used": self._metrics.bypasses_used, "governance_checks": self._metrics.governance_checks,
            "uptime_seconds": round(self._metrics.uptime_seconds, 2), "research_queue_depth": len(self._research_queue),
            "registered_brains": len(self._brain_registry),
        }

    def export_full_state(self) -> str:
        return json.dumps({"metrics": self.get_metrics(), "brains": {bid: {"active": info["active"], "config": info["config"]} for bid, info in self._brain_registry.items()}, "queue": self._research_queue[-10:]}, indent=2)
