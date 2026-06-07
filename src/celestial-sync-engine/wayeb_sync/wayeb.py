"""
Wayeb Synchronization Module
Implements the 5-day Wayeb cycle for maintenance windows, reflection periods,
and system recalibration.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import time


class WayebPhase(Enum):
    INTROSPECTION = "introspection"
    CONSOLIDATION = "consolidation"
    PURIFICATION = "purification"
    REALIGNMENT = "realignment"
    EMERGENCE = "emergence"


WAYEB_CYCLE_SECONDS = 432000
PHASE_DURATION = 86400


@dataclass
class WayebEvent:
    event_id: str
    phase: WayebPhase
    action: str
    target_module: str
    payload: Dict[str, Any] = field(default_factory=dict)
    executed: bool = False
    execution_time: float = 0.0


class WayebSynchronizer:
    def __init__(self, cycle_start: Optional[float] = None):
        self._cycle_start = cycle_start or time.time()
        self._events: Dict[WayebPhase, List[WayebEvent]] = {phase: [] for phase in WayebPhase}
        self._current_cycle: int = 0
        self._active: bool = True

    @property
    def current_phase(self) -> WayebPhase:
        elapsed = time.time() - self._cycle_start
        cycle_position = elapsed % WAYEB_CYCLE_SECONDS
        day_index = int(cycle_position / PHASE_DURATION) % 5
        return list(WayebPhase)[day_index]

    @property
    def phase_progress(self) -> float:
        elapsed = time.time() - self._cycle_start
        cycle_position = elapsed % WAYEB_CYCLE_SECONDS
        day_position = cycle_position % PHASE_DURATION
        return day_position / PHASE_DURATION

    @property
    def cycle_number(self) -> int:
        elapsed = time.time() - self._cycle_start
        return int(elapsed / WAYEB_CYCLE_SECONDS)

    def register_event(self, event: WayebEvent) -> None:
        self._events[event.phase].append(event)

    def get_pending_events(self) -> List[WayebEvent]:
        phase = self.current_phase
        return [e for e in self._events[phase] if not e.executed]

    def mark_executed(self, event_id: str) -> bool:
        for phase_events in self._events.values():
            for event in phase_events:
                if event.event_id == event_id:
                    event.executed = True
                    event.execution_time = time.time()
                    return True
        return False

    def reset_cycle(self) -> None:
        self._cycle_start = time.time()
        self._current_cycle += 1
        for phase_events in self._events.values():
            for event in phase_events:
                event.executed = False
                event.execution_time = 0.0

    def is_maintenance_window(self) -> bool:
        return self.current_phase in (WayebPhase.CONSOLIDATION, WayebPhase.PURIFICATION)

    def should_defer_execution(self) -> bool:
        return self.current_phase == WayebPhase.INTROSPECTION and self._active

    def export_state(self) -> Dict[str, Any]:
        return {
            "cycle_start": self._cycle_start,
            "current_phase": self.current_phase.value,
            "phase_progress": round(self.phase_progress, 4),
            "cycle_number": self.cycle_number,
            "active": self._active,
            "pending_events": sum(1 for events in self._events.values() for e in events if not e.executed),
        }
