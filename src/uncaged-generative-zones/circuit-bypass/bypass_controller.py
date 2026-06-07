"""
Circuit Bypass Controller - Routes Mini-Brain ops past CI/CD breakers.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Set
from enum import Enum
import time


class BreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class BypassRoute:
    route_id: str
    source_zone: str
    target: str
    bypassed_breakers: List[str]
    governance_approval: str
    active: bool = True
    created_at: float = field(default_factory=time.time)


class CircuitBypassController:
    def __init__(self):
        self._breaker_states: Dict[str, BreakerState] = {}
        self._bypass_routes: Dict[str, BypassRoute] = {}
        self._blocked_operations: List[Dict[str, Any]] = []
        self._authorized_zones: Set[str] = {
            "zone://uncaged/mini-brains/",
            "zone://uncaged/research-push/",
            "zone://uncaged/execution-sandboxes/",
        }

    def register_breaker(self, breaker_id: str, initial_state: BreakerState = BreakerState.CLOSED) -> None:
        self._breaker_states[breaker_id] = initial_state

    def register_bypass(self, route: BypassRoute) -> bool:
        if not route.governance_approval:
            return False
        if not any(route.source_zone.startswith(zone) for zone in self._authorized_zones):
            return False
        self._bypass_routes[route.route_id] = route
        return True

    def can_bypass(self, source: str, target: str) -> bool:
        for route in self._bypass_routes.values():
            if not route.active:
                continue
            if source.startswith(route.source_zone) and route.target == target:
                return True
        return False

    def attempt_passage(self, source: str, target: str, operation: str) -> Dict[str, Any]:
        if self.can_bypass(source, target):
            return {"allowed": True, "method": "bypass", "source": source, "target": target}
        blocking = [bid for bid, state in self._breaker_states.items() if state == BreakerState.OPEN]
        if blocking:
            self._blocked_operations.append({"source": source, "target": target, "operation": operation, "blocked_by": blocking, "timestamp": time.time()})
            return {"allowed": False, "method": "blocked", "blocked_by": blocking}
        return {"allowed": True, "method": "normal", "source": source, "target": target}

    def get_status(self) -> Dict[str, Any]:
        return {
            "breakers": {bid: state.value for bid, state in self._breaker_states.items()},
            "bypass_routes": len(self._bypass_routes),
            "active_bypasses": sum(1 for r in self._bypass_routes.values() if r.active),
            "blocked_operations": len(self._blocked_operations),
            "authorized_zones": list(self._authorized_zones),
        }
