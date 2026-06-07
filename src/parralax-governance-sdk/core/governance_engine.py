"""
Parralax Governance SDK - Core Engine
Compiled governance physics for sovereign decision-making loops.
Integrates with the PRODUCTION- governance pipelines and atlas-registry.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import hashlib
import time
import json


class GovernanceMode(Enum):
    SOVEREIGN = "sovereign"
    DELEGATED = "delegated"
    CONSENSUS = "consensus"
    AUTONOMOUS = "autonomous"


class PolicyVerdict(Enum):
    ALLOW = "allow"
    DENY = "deny"
    ESCALATE = "escalate"
    DEFER = "defer"


@dataclass
class GovernanceContext:
    """Immutable context for a governance decision cycle."""
    actor_id: str
    resource_path: str
    action: str
    timestamp: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    provenance_hash: str = ""

    def __post_init__(self):
        if not self.provenance_hash:
            seed = f"{self.actor_id}:{self.resource_path}:{self.action}:{self.timestamp}"
            self.provenance_hash = hashlib.sha256(seed.encode()).hexdigest()[:16]


@dataclass
class PolicyRule:
    """A single governance policy rule."""
    rule_id: str
    description: str
    mode: GovernanceMode
    conditions: Dict[str, Any]
    verdict: PolicyVerdict
    priority: int = 0


class ParralaxGovernanceEngine:
    """
    Core governance engine implementing the Parralax physics model.
    Handles policy evaluation, sovereign decision loops, and audit trails.
    """

    def __init__(self, mode: GovernanceMode = GovernanceMode.SOVEREIGN):
        self.mode = mode
        self._policies: List[PolicyRule] = []
        self._audit_log: List[Dict[str, Any]] = []
        self._atlas_registry_ref: Optional[str] = None

    def register_policy(self, rule: PolicyRule) -> None:
        """Register a governance policy rule."""
        self._policies.append(rule)
        self._policies.sort(key=lambda r: r.priority, reverse=True)

    def evaluate(self, context: GovernanceContext) -> PolicyVerdict:
        """Evaluate a governance context against all registered policies."""
        for rule in self._policies:
            if rule.mode != self.mode and rule.mode != GovernanceMode.AUTONOMOUS:
                continue
            if self._match_conditions(rule.conditions, context):
                self._log_decision(context, rule)
                return rule.verdict
        self._log_decision(context, None)
        return PolicyVerdict.ESCALATE

    def bind_atlas_registry(self, registry_ref: str) -> None:
        """Bind to the existing atlas-registry in sdk/governance/."""
        self._atlas_registry_ref = registry_ref

    def get_audit_trail(self) -> List[Dict[str, Any]]:
        """Return the full audit trail for this engine instance."""
        return self._audit_log.copy()

    def export_state(self) -> str:
        """Export engine state as JSON for cross-module consumption."""
        return json.dumps({
            "mode": self.mode.value,
            "policy_count": len(self._policies),
            "audit_entries": len(self._audit_log),
            "atlas_ref": self._atlas_registry_ref,
        })

    def _match_conditions(self, conditions: Dict[str, Any], context: GovernanceContext) -> bool:
        for key, expected in conditions.items():
            if key == "actor_id" and context.actor_id != expected:
                return False
            if key == "resource_prefix" and not context.resource_path.startswith(expected):
                return False
            if key == "action" and context.action != expected:
                return False
        return True

    def _log_decision(self, context: GovernanceContext, rule: Optional[PolicyRule]) -> None:
        self._audit_log.append({
            "timestamp": time.time(),
            "context_hash": context.provenance_hash,
            "actor": context.actor_id,
            "resource": context.resource_path,
            "action": context.action,
            "rule_applied": rule.rule_id if rule else "DEFAULT_ESCALATE",
            "verdict": rule.verdict.value if rule else PolicyVerdict.ESCALATE.value,
        })
