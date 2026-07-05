#!/usr/bin/env python3
"""
PROTO-REGISTRY: Protocol Registry and Deployment Coordinator
═════════════════════════════════════════════════════════════

Maps all intelligence protocol cores to deployable Workload units
in the orchestrator. Enables protocols to be first-class deployable
artifacts in the Aether Sovereign Platform.

Protocols are registered with:
  - Protocol ID (PROTO-FED-001, PROTO-WORK-001, etc.)
  - Handler function (what to call when workload executes)
  - Ring affinity (which rings can deploy it)
  - Resource requirements (memory, CPU, isolation level)
  - Fallback behavior (graceful degradation if unavailable)
"""

import sys
from enum import Enum
from typing import Dict, Any, Callable, Optional, List
from dataclasses import dataclass, field
import json

PHI = 1.618033988749895
PHI_INV = 0.618033988749895
HEARTBEAT_MS = 873


class IsolationLevel(Enum):
    """Execution isolation guarantees."""
    NONE = 0
    PROCESS = 1
    CONTAINER = 2
    VM = 3


@dataclass
class ProtocolSpec:
    """Describes a protocol's deployment contract."""
    protocol_id: str
    name: str
    handler_module: str  # e.g., 'protocols.agent_federation_protocol'
    handler_fn: str  # e.g., 'FederationMesh.delegate'
    ring_affinity: List[str] = field(default_factory=lambda: ['InterfaceRing'])
    memory_mb: int = 128
    cpu_millicores: int = 250
    isolation: IsolationLevel = IsolationLevel.PROCESS
    fallback_enabled: bool = True
    timeout_ms: int = 5000
    retries: int = 2
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'protocol_id': self.protocol_id,
            'name': self.name,
            'handler_module': self.handler_module,
            'handler_fn': self.handler_fn,
            'ring_affinity': self.ring_affinity,
            'memory_mb': self.memory_mb,
            'cpu_millicores': self.cpu_millicores,
            'isolation': self.isolation.name,
            'fallback_enabled': self.fallback_enabled,
            'timeout_ms': self.timeout_ms,
            'retries': self.retries,
            'metadata': self.metadata,
        }


class ProtocolRegistry:
    """Central registry for all protocol cores."""

    def __init__(self):
        self.protocols: Dict[str, ProtocolSpec] = {}
        self.handlers: Dict[str, Callable] = {}
        self._boot()

    def _boot(self) -> None:
        """Register all 10 intelligence protocol cores."""
        # Federation & Orchestration
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-FED-001',
                name='Agent Federation Mesh',
                handler_module='protocols.agent_federation_protocol',
                handler_fn='FederationMesh.delegate',
                ring_affinity=['SovereignRing', 'CognitiveRing'],
                memory_mb=256,
                cpu_millicores=500,
                metadata={'type': 'mesh', 'peers': 'dynamic'},
            )
        )

        self.register(
            ProtocolSpec(
                protocol_id='PROTO-WORK-001',
                name='Task Orchestration DAG',
                handler_module='protocols.task_orchestration_protocol',
                handler_fn='TaskDAG.readyQueue',
                ring_affinity=['CognitiveRing', 'RouteRing'],
                memory_mb=256,
                cpu_millicores=500,
                metadata={'type': 'orchestrator', 'dataflow': 'DAG'},
            )
        )

        # Synthesis & Generation
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-GEN-001',
                name='Multimodal Synthesis',
                handler_module='protocols.multimodal_synthesis_protocol',
                handler_fn='MultimodalSynthesizer.fuse',
                ring_affinity=['NeuralRing', 'CognitiveRing'],
                memory_mb=512,
                cpu_millicores=1000,
                metadata={'type': 'fusion', 'modalities': ['text', 'code', 'image', 'audio', 'data']},
            )
        )

        self.register(
            ProtocolSpec(
                protocol_id='PROTO-GEN-002',
                name='Website Generation',
                handler_module='protocols.website_generation_protocol',
                handler_fn='generateSiteSpec',
                ring_affinity=['InterfaceRing', 'MemoryRing'],
                memory_mb=256,
                cpu_millicores=500,
                metadata={'type': 'codegen', 'targets': ['sveltekit', 'nextjs', 'astro', 'remix', 'vanilla']},
            )
        )

        # Finance & Trading
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-FIN-001',
                name='Finance Signal Processor',
                handler_module='protocols.finance_signal_protocol',
                handler_fn='FinanceSignalProcessor.process',
                ring_affinity=['SovereignRing'],
                memory_mb=512,
                cpu_millicores=1000,
                isolation=IsolationLevel.CONTAINER,
                metadata={'type': 'signal', 'gates': 3, 'tiers': ['SOVEREIGN', 'COHERENT', 'CHAOTIC']},
            )
        )

        self.register(
            ProtocolSpec(
                protocol_id='PROTO-FIN-002',
                name='Trading Execution',
                handler_module='protocols.trading_execution_protocol',
                handler_fn='ExecutionEngine.execute',
                ring_affinity=['SovereignRing'],
                memory_mb=512,
                cpu_millicores=2000,
                isolation=IsolationLevel.CONTAINER,
                timeout_ms=10000,
                retries=3,
                metadata={'type': 'execution', 'pipeline': 'validate→route→fill', 'gates': 3},
            )
        )

        # Infrastructure & Deployment
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-INFRA-001',
                name='Infrastructure Codegen',
                handler_module='protocols.infrastructure_codegen_protocol',
                handler_fn='generate',
                ring_affinity=['CognitiveRing', 'RouteRing'],
                memory_mb=256,
                cpu_millicores=500,
                metadata={'type': 'codegen', 'targets': ['cloudflare', 'icp', 'terraform', 'compose', 'github_ci']},
            )
        )

        # Evaluation & Monitoring
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-AI-001',
                name='AI Evaluation',
                handler_module='protocols.ai_evaluation_protocol',
                handler_fn='ModelEvaluator.record',
                ring_affinity=['CognitiveRing', 'NeuralRing'],
                memory_mb=512,
                cpu_millicores=1000,
                metadata={'type': 'eval', 'dimensions': ['accuracy', 'coherence', 'latency', 'cost']},
            )
        )

        # Federation & Mesh
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-FED-002',
                name='Sovereign Federation',
                handler_module='protocols.sovereign_federation_protocol',
                handler_fn='SovereignFederation.route',
                ring_affinity=['SovereignRing', 'SovereignEdgeRing'],
                memory_mb=512,
                cpu_millicores=1000,
                isolation=IsolationLevel.CONTAINER,
                metadata={'type': 'mesh', 'substrates': ['gateway', 'worker', 'canister', 'relay', 'oracle', 'edge']},
            )
        )

        # Workflows
        self.register(
            ProtocolSpec(
                protocol_id='PROTO-WORK-002',
                name='Workflow Engine',
                handler_module='protocols.workflow_engine_protocol',
                handler_fn='WorkflowInstance.tick',
                ring_affinity=['CognitiveRing', 'RouteRing', 'InterfaceRing'],
                memory_mb=512,
                cpu_millicores=1000,
                metadata={'type': 'workflow', 'templates': ['onboarding', 'release', 'trade', 'analysis', 'build_site', 'agent_eval']},
            )
        )

    def register(self, spec: ProtocolSpec) -> None:
        """Register a protocol spec."""
        self.protocols[spec.protocol_id] = spec

    def get(self, protocol_id: str) -> Optional[ProtocolSpec]:
        """Fetch a protocol spec by ID."""
        return self.protocols.get(protocol_id)

    def list_all(self) -> List[ProtocolSpec]:
        """Return all registered protocols."""
        return list(self.protocols.values())

    def by_ring(self, ring: str) -> List[ProtocolSpec]:
        """Find all protocols deployable on a given ring."""
        return [p for p in self.protocols.values() if ring in p.ring_affinity]

    def by_type(self, proto_type: str) -> List[ProtocolSpec]:
        """Find protocols by metadata type (mesh, orchestrator, codegen, etc.)."""
        return [p for p in self.protocols.values() if p.metadata.get('type') == proto_type]

    def snapshot(self) -> Dict[str, Any]:
        """Return registry state."""
        return {
            'total_protocols': len(self.protocols),
            'protocols': {pid: spec.to_dict() for pid, spec in self.protocols.items()},
        }

    def to_json(self) -> str:
        """Serialize registry to JSON."""
        return json.dumps(self.snapshot(), indent=2)


# Global singleton instance
_REGISTRY: Optional[ProtocolRegistry] = None


def get_registry() -> ProtocolRegistry:
    """Get or create the singleton registry."""
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = ProtocolRegistry()
    return _REGISTRY


def list_protocols() -> List[Dict[str, Any]]:
    """Return all protocols as list of dicts (for REST API)."""
    return [spec.to_dict() for spec in get_registry().list_all()]


def get_protocol(protocol_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a protocol by ID (for REST API)."""
    spec = get_registry().get(protocol_id)
    return spec.to_dict() if spec else None


def protocols_by_ring(ring: str) -> List[Dict[str, Any]]:
    """List protocols deployable on a ring (for REST API)."""
    return [spec.to_dict() for spec in get_registry().by_ring(ring)]


if __name__ == '__main__':
    registry = get_registry()
    print(registry.to_json())
