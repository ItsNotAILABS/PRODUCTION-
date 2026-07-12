"""
Aether Sovereign Zero-Trust Policy Engine.

Ring-based RBAC: every principal (user, service account, agent) is assigned
a RingAffinity. Actions on resources that require a higher ring are denied.
Sovereign ring = highest privilege. InterfaceRing = read-only observer.

This replaces Rancher's cluster-level RBAC + project roles with a single,
mathematically consistent permission model derived from the organism architecture.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Dict, FrozenSet, Optional, Set


class Ring(IntEnum):
    """Ordered ring hierarchy — lower ordinal = higher privilege."""
    SOVEREIGN       = 0
    SOVEREIGN_EDGE  = 1
    COGNITIVE       = 2
    NEURAL          = 3
    MEMORY          = 4
    ROUTE           = 5
    AFFECTIVE       = 6
    SOMATIC         = 7
    QUANTUM         = 8
    TEMPORAL        = 9
    INTERFACE       = 10   # observer, read-only


class Action(IntEnum):
    DEPLOY       = 0
    ROLLBACK     = 1
    DELETE       = 2
    SCALE        = 3
    VIEW_SECRETS = 4
    REGISTER     = 5
    AUDIT        = 6
    READ         = 10


# Ring required to perform each action (any ring ≤ required passes)
ACTION_RING_REQUIREMENTS: Dict[Action, Ring] = {
    Action.DEPLOY:       Ring.COGNITIVE,
    Action.ROLLBACK:     Ring.SOVEREIGN_EDGE,
    Action.DELETE:       Ring.SOVEREIGN,
    Action.SCALE:        Ring.NEURAL,
    Action.VIEW_SECRETS: Ring.SOVEREIGN_EDGE,
    Action.REGISTER:     Ring.ROUTE,
    Action.AUDIT:        Ring.MEMORY,
    Action.READ:         Ring.INTERFACE,
}


@dataclass
class Principal:
    principal_id: str
    name: str
    ring: Ring
    scopes: FrozenSet[str] = field(default_factory=frozenset)  # workload/target ids

    def can(self, action: Action, scope: Optional[str] = None) -> bool:
        """
        Return True if this principal may perform the action.
        Ring check: principal.ring ≤ required_ring (lower = more privileged).
        Scope check: if scopes is non-empty, scope must be in scopes.
        """
        required = ACTION_RING_REQUIREMENTS.get(action, Ring.SOVEREIGN)
        if self.ring > required:
            return False
        if self.scopes and scope and scope not in self.scopes:
            return False
        return True


@dataclass
class PolicyDecision:
    allowed: bool
    principal_id: str
    action: Action
    scope: Optional[str]
    reason: str

    def to_dict(self) -> dict:
        return {
            "allowed":      self.allowed,
            "principal_id": self.principal_id,
            "action":       self.action.name,
            "scope":        self.scope,
            "reason":       self.reason,
        }


class PolicyEngine:
    def __init__(self) -> None:
        self._principals: Dict[str, Principal] = {}
        self._audit_log: list = []

    def register_principal(self, principal: Principal) -> None:
        self._principals[principal.principal_id] = principal

    def revoke_principal(self, principal_id: str) -> bool:
        if principal_id in self._principals:
            del self._principals[principal_id]
            return True
        return False

    def evaluate(self, principal_id: str, action: Action, scope: Optional[str] = None) -> PolicyDecision:
        principal = self._principals.get(principal_id)
        if principal is None:
            decision = PolicyDecision(
                allowed=False,
                principal_id=principal_id,
                action=action,
                scope=scope,
                reason="unknown_principal",
            )
        elif principal.can(action, scope):
            decision = PolicyDecision(
                allowed=True,
                principal_id=principal_id,
                action=action,
                scope=scope,
                reason=f"ring_{principal.ring.name}_authorized",
            )
        else:
            required = ACTION_RING_REQUIREMENTS.get(action, Ring.SOVEREIGN)
            decision = PolicyDecision(
                allowed=False,
                principal_id=principal_id,
                action=action,
                scope=scope,
                reason=f"insufficient_ring: has {principal.ring.name}, needs {required.name}",
            )

        self._audit_log.append(decision.to_dict())
        return decision

    def audit_log(self, limit: int = 100) -> list:
        return self._audit_log[-limit:]

    def snapshot(self) -> dict:
        return {
            "principals": [
                {
                    "id":    p.principal_id,
                    "name":  p.name,
                    "ring":  p.ring.name,
                    "scopes": list(p.scopes),
                }
                for p in self._principals.values()
            ],
            "audit_log_size": len(self._audit_log),
        }
