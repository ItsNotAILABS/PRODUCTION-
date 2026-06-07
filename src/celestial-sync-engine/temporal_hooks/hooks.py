"""
Temporal Hook Registry
Provides event-driven hooks that fire based on temporal conditions.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import time


class HookTrigger(Enum):
    PHASE_ENTER = "phase_enter"
    PHASE_EXIT = "phase_exit"
    CYCLE_COMPLETE = "cycle_complete"
    INTERVAL = "interval"
    THRESHOLD = "threshold"
    CONVERGENCE = "convergence"


@dataclass
class TemporalHook:
    hook_id: str
    trigger: HookTrigger
    target_module: str
    action: str
    conditions: Dict[str, Any] = field(default_factory=dict)
    cooldown_seconds: float = 0.0
    last_triggered: float = 0.0
    trigger_count: int = 0
    enabled: bool = True


class TemporalHookRegistry:
    def __init__(self):
        self._hooks: Dict[str, TemporalHook] = {}
        self._listeners: Dict[HookTrigger, List[str]] = {trigger: [] for trigger in HookTrigger}

    def register(self, hook: TemporalHook) -> None:
        self._hooks[hook.hook_id] = hook
        self._listeners[hook.trigger].append(hook.hook_id)

    def unregister(self, hook_id: str) -> bool:
        if hook_id in self._hooks:
            hook = self._hooks[hook_id]
            self._listeners[hook.trigger].remove(hook_id)
            del self._hooks[hook_id]
            return True
        return False

    def get_ready_hooks(self, trigger: HookTrigger, context: Optional[Dict[str, Any]] = None) -> List[TemporalHook]:
        now = time.time()
        ready = []
        for hook_id in self._listeners.get(trigger, []):
            hook = self._hooks.get(hook_id)
            if hook and hook.enabled:
                if hook.cooldown_seconds > 0:
                    if (now - hook.last_triggered) < hook.cooldown_seconds:
                        continue
                if context and not self._match_conditions(hook.conditions, context):
                    continue
                ready.append(hook)
        return ready

    def fire(self, hook_id: str) -> bool:
        if hook_id in self._hooks:
            hook = self._hooks[hook_id]
            hook.last_triggered = time.time()
            hook.trigger_count += 1
            return True
        return False

    def export_state(self) -> Dict[str, Any]:
        return {
            "total_hooks": len(self._hooks),
            "enabled_hooks": sum(1 for h in self._hooks.values() if h.enabled),
            "total_triggers": sum(h.trigger_count for h in self._hooks.values()),
            "hooks": {
                hid: {"trigger": h.trigger.value, "target": h.target_module, "fires": h.trigger_count, "enabled": h.enabled}
                for hid, h in self._hooks.items()
            },
        }

    def _match_conditions(self, conditions: Dict[str, Any], context: Dict[str, Any]) -> bool:
        for key, expected in conditions.items():
            if key not in context:
                return False
            if context[key] != expected:
                return False
        return True
