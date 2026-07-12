"""Reactive formula engine + physics primitives shared across organism simulations.

Two halves:
  - `Cell` — a spreadsheet-style reactive value: either a settable source or a
    formula derived from other cells. Reading `.value` inside another cell's
    formula auto-registers a dependency edge; setting a source cell marks
    every transitive dependent dirty so the next read recomputes instead of
    returning a stale value. A `Cell` can also wrap external (non-Cell) state
    that the caller invalidates manually via `invalidate()` — used as a
    memoized cache rather than a full dependency graph.
  - Kuramoto phase-coupling primitives (`phi_decay`, `kuramoto_step`,
    `order_parameter`) — the exact formulas PROTO-211 (Neuro-Emergence
    Protocol, protocols/neuro-emergence-protocol.js) uses in JS, so a Python
    simulation built on these stays numerically consistent with the rest of
    the ecosystem.
"""
from __future__ import annotations

import math
import threading
from dataclasses import dataclass
from typing import Callable, Generic, Iterable, TypeVar

from .constants import GOLDEN_ANGLE, PHI

T = TypeVar("T")

_compute_stack: list["Cell"] = []


class Cell(Generic[T]):
    """A reactive value: either a settable source or a formula derived from other cells."""

    def __init__(self, value_or_formula: T | Callable[[], T], *, name: str | None = None) -> None:
        self.name = name
        self._lock = threading.Lock()
        self._dependents: set["Cell"] = set()
        if callable(value_or_formula):
            self._formula: Callable[[], T] | None = value_or_formula
            self._value: T | None = None
            self._dirty = True
        else:
            self._formula = None
            self._value = value_or_formula
            self._dirty = False

    @property
    def value(self) -> T:
        if _compute_stack:
            self._dependents.add(_compute_stack[-1])
        if self._dirty and self._formula is not None:
            _compute_stack.append(self)
            try:
                self._value = self._formula()
            finally:
                _compute_stack.pop()
            self._dirty = False
        return self._value  # type: ignore[return-value]

    @value.setter
    def value(self, new_value: T) -> None:
        if self._formula is not None:
            raise TypeError(f"Cell {self.name or '<formula>'} is derived — set its upstream sources instead")
        with self._lock:
            if new_value == self._value:
                return
            self._value = new_value
        self._mark_dependents_dirty()

    def invalidate(self) -> None:
        """Force a recompute on next read — for formula cells driven by state outside the Cell graph."""
        self._dirty = True
        self._mark_dependents_dirty()

    def _mark_dependents_dirty(self) -> None:
        for dep in self._dependents:
            if not dep._dirty:
                dep._dirty = True
                dep._mark_dependents_dirty()

    def __repr__(self) -> str:
        return f"Cell({self.name or 'anon'}={'<dirty>' if self._dirty else self._value!r})"


def formula(fn: Callable[[], T]) -> Cell[T]:
    """Decorator-style constructor for a derived Cell: `c = formula(lambda: a.value + b.value)`."""
    return Cell(fn)


def phi_decay(initial: float, age_s: float, half_life_s: float = GOLDEN_ANGLE) -> float:
    """Phi-weighted decay toward zero — same curve organism/resonance.py uses for peer signal strength."""
    return initial / (1.0 + (age_s / half_life_s) ** (1.0 / PHI))


@dataclass
class PhaseCoupling:
    """A Kuramoto-style coupling between two named oscillators."""

    a: str
    b: str
    strength: float = PHI - 1.0
    coherence: float = 0.0


def kuramoto_step(
    phases: dict[str, float],
    activities: dict[str, float],
    couplings: Iterable[PhaseCoupling],
    dt: float,
) -> dict[str, float]:
    """Advance a set of coupled phase oscillators by one step (mirrors PROTO-211's `step()`).

    Mutates each coupling's `.coherence` in place and returns the updated phase map.
    """
    next_phases = dict(phases)
    for c in couplings:
        if c.a not in phases or c.b not in phases:
            continue
        phase_diff = phases[c.b] - phases[c.a]
        force = c.strength * math.sin(phase_diff)
        next_phases[c.a] = (next_phases[c.a] + force * dt * activities.get(c.a, 1.0)) % (2 * math.pi)
        next_phases[c.b] = (next_phases[c.b] - force * dt * activities.get(c.b, 1.0)) % (2 * math.pi)
        c.coherence = math.cos(phase_diff)
    return next_phases


def order_parameter(phases: Iterable[float]) -> tuple[float, float]:
    """Kuramoto order parameter: (R, collective_phase) — R is the synchrony/'emergence' measure in [0, 1]."""
    phases = list(phases)
    n = len(phases)
    if n == 0:
        return 0.0, 0.0
    sum_cos = sum(math.cos(p) for p in phases) / n
    sum_sin = sum(math.sin(p) for p in phases) / n
    r = math.hypot(sum_cos, sum_sin)
    psi = math.atan2(sum_sin, sum_cos)
    return r, psi


def mean_field_kuramoto_step(
    phases: dict[str, float],
    activities: dict[str, float],
    coupling: float,
    dt: float,
) -> dict[str, float]:
    """Advance a fully-connected (mean-field) population of phase oscillators by one step.

    Every oscillator nudges toward the population's collective phase, scaled by
    `coupling`. Unlike `kuramoto_step`'s arbitrary pairwise graph, mean-field
    coupling reliably converges toward synchrony once `coupling` exceeds the
    critical threshold — the right model for a population-level 'global
    coherence' metric over a large connectome (sparse pairwise graphs like a
    ring converge slowly and non-monotonically under a large Euler step).
    """
    r, psi = order_parameter(phases.values())
    next_phases = {}
    for node_id, theta in phases.items():
        force = coupling * r * math.sin(psi - theta)
        next_phases[node_id] = (theta + force * dt * activities.get(node_id, 1.0)) % (2 * math.pi)
    return next_phases
