"""
Astral Scheduler - Temporal cycle management engine.
Manages execution timing based on celestial cycles, enabling
agents and mini-brains to synchronize operations with natural rhythms.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import time
import math


class CelestialCycle(Enum):
    SOLAR = "solar"
    LUNAR = "lunar"
    MERCURY = "mercury"
    VENUS = "venus"
    MARS = "mars"
    FIBONACCI = "fibonacci"
    PHI = "phi"
    WAYEB = "wayeb"


CYCLE_DURATIONS: Dict[CelestialCycle, float] = {
    CelestialCycle.SOLAR: 86400.0,
    CelestialCycle.LUNAR: 2551392.0,
    CelestialCycle.MERCURY: 7600416.0,
    CelestialCycle.VENUS: 19414080.0,
    CelestialCycle.MARS: 59354928.0,
    CelestialCycle.FIBONACCI: 0.0,
    CelestialCycle.PHI: 0.0,
    CelestialCycle.WAYEB: 432000.0,
}

PHI = (1 + math.sqrt(5)) / 2


@dataclass
class ScheduleEntry:
    entry_id: str
    cycle: CelestialCycle
    callback_ref: str
    phase_offset: float = 0.0
    last_fired: float = 0.0
    fire_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class AstralScheduler:
    def __init__(self, epoch: Optional[float] = None):
        self._epoch = epoch or time.time()
        self._entries: Dict[str, ScheduleEntry] = {}
        self._fibonacci_cache: List[int] = [1, 1]

    def register(self, entry: ScheduleEntry) -> None:
        self._entries[entry.entry_id] = entry

    def unregister(self, entry_id: str) -> bool:
        if entry_id in self._entries:
            del self._entries[entry_id]
            return True
        return False

    def get_phase(self, cycle: CelestialCycle, at_time: Optional[float] = None) -> float:
        now = at_time or time.time()
        elapsed = now - self._epoch
        duration = CYCLE_DURATIONS.get(cycle, 0.0)
        if duration <= 0:
            if cycle == CelestialCycle.PHI:
                return (elapsed * PHI) % 1.0
            if cycle == CelestialCycle.FIBONACCI:
                fib_seconds = self._get_fibonacci_interval(int(elapsed / 3600))
                return (elapsed % fib_seconds) / fib_seconds if fib_seconds > 0 else 0.0
            return 0.0
        return (elapsed % duration) / duration

    def check_ready(self, at_time: Optional[float] = None) -> List[ScheduleEntry]:
        now = at_time or time.time()
        ready = []
        for entry in self._entries.values():
            phase = self.get_phase(entry.cycle, now)
            if self._should_fire(entry, phase, now):
                ready.append(entry)
        return ready

    def fire(self, entry_id: str) -> bool:
        if entry_id not in self._entries:
            return False
        entry = self._entries[entry_id]
        entry.last_fired = time.time()
        entry.fire_count += 1
        return True

    def get_next_fire_time(self, entry_id: str) -> Optional[float]:
        if entry_id not in self._entries:
            return None
        entry = self._entries[entry_id]
        cycle_duration = CYCLE_DURATIONS.get(entry.cycle, 0.0)
        if cycle_duration <= 0:
            return None
        current_phase = self.get_phase(entry.cycle)
        if current_phase < entry.phase_offset:
            remaining_phase = entry.phase_offset - current_phase
        else:
            remaining_phase = 1.0 - current_phase + entry.phase_offset
        return time.time() + (remaining_phase * cycle_duration)

    def export_state(self) -> Dict[str, Any]:
        return {
            "epoch": self._epoch,
            "entry_count": len(self._entries),
            "entries": {
                eid: {
                    "cycle": e.cycle.value,
                    "phase_offset": e.phase_offset,
                    "fire_count": e.fire_count,
                    "last_fired": e.last_fired,
                }
                for eid, e in self._entries.items()
            },
        }

    def _should_fire(self, entry: ScheduleEntry, current_phase: float, now: float) -> bool:
        tolerance = 0.01
        phase_diff = abs(current_phase - entry.phase_offset)
        if phase_diff < tolerance or (1.0 - phase_diff) < tolerance:
            cycle_duration = CYCLE_DURATIONS.get(entry.cycle, 86400.0)
            if cycle_duration > 0 and (now - entry.last_fired) > (cycle_duration * 0.9):
                return True
        return False

    def _get_fibonacci_interval(self, index: int) -> float:
        while len(self._fibonacci_cache) <= abs(index) % 20:
            self._fibonacci_cache.append(
                self._fibonacci_cache[-1] + self._fibonacci_cache[-2]
            )
        return float(self._fibonacci_cache[abs(index) % 20] * 3600)
