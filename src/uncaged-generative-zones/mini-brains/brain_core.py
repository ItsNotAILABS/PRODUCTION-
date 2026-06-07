"""
Mini-Brain Core - Autonomous agent execution unit.
Each Mini-Brain operates within Uncaged Generative Zones, governed by Parralax policies.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import time
import hashlib


class BrainState(Enum):
    DORMANT = "dormant"
    INITIALIZING = "initializing"
    ACTIVE = "active"
    RESEARCHING = "researching"
    PUSHING = "pushing"
    COOLING = "cooling"
    ERROR = "error"


class BrainCapability(Enum):
    RESEARCH = "research"
    SYNTHESIS = "synthesis"
    ANALYSIS = "analysis"
    GENERATION = "generation"
    VERIFICATION = "verification"
    EXPLORATION = "exploration"


@dataclass
class ResearchArtifact:
    artifact_id: str
    brain_id: str
    title: str
    content: Dict[str, Any]
    confidence: float
    timestamp: float = field(default_factory=time.time)
    pushed: bool = False


@dataclass
class MiniBrain:
    brain_id: str
    designation: str
    capabilities: List[BrainCapability] = field(default_factory=list)
    state: BrainState = BrainState.DORMANT
    memory: Dict[str, Any] = field(default_factory=dict)
    artifacts: List[ResearchArtifact] = field(default_factory=list)
    cycle_count: int = 0
    created_at: float = field(default_factory=time.time)
    last_active: float = 0.0
    max_artifacts_per_cycle: int = 10
    governance_context: Optional[str] = None

    def activate(self) -> bool:
        if self.state in (BrainState.DORMANT, BrainState.COOLING):
            self.state = BrainState.INITIALIZING
            self.last_active = time.time()
            self.state = BrainState.ACTIVE
            return True
        return False

    def begin_research(self, topic: str, parameters: Optional[Dict[str, Any]] = None) -> str:
        if self.state != BrainState.ACTIVE:
            return ""
        self.state = BrainState.RESEARCHING
        self.cycle_count += 1
        research_id = self._generate_id(f"{self.brain_id}:research:{topic}")
        self.memory["current_research"] = {"id": research_id, "topic": topic, "parameters": parameters or {}, "started_at": time.time()}
        return research_id

    def produce_artifact(self, title: str, content: Dict[str, Any], confidence: float = 0.5) -> Optional[ResearchArtifact]:
        if self.state != BrainState.RESEARCHING:
            return None
        if len(self.artifacts) >= self.max_artifacts_per_cycle * self.cycle_count:
            return None
        artifact = ResearchArtifact(artifact_id=self._generate_id(f"{self.brain_id}:{title}"), brain_id=self.brain_id, title=title, content=content, confidence=min(max(confidence, 0.0), 1.0))
        self.artifacts.append(artifact)
        return artifact

    def push_to_staging(self) -> List[str]:
        self.state = BrainState.PUSHING
        pushed_ids = []
        for artifact in self.artifacts:
            if not artifact.pushed:
                artifact.pushed = True
                pushed_ids.append(artifact.artifact_id)
        self.state = BrainState.ACTIVE
        return pushed_ids

    def cool_down(self) -> None:
        self.state = BrainState.COOLING
        self.memory.pop("current_research", None)

    def deactivate(self) -> None:
        self.state = BrainState.DORMANT
        self.last_active = time.time()

    def export_state(self) -> Dict[str, Any]:
        return {
            "brain_id": self.brain_id, "designation": self.designation, "state": self.state.value,
            "capabilities": [c.value for c in self.capabilities], "cycle_count": self.cycle_count,
            "artifact_count": len(self.artifacts), "unpushed_artifacts": sum(1 for a in self.artifacts if not a.pushed),
            "last_active": self.last_active, "governance_context": self.governance_context,
        }

    def _generate_id(self, seed: str) -> str:
        return hashlib.sha256(f"{seed}:{time.time()}".encode()).hexdigest()[:12]
