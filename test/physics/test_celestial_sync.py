"""Tests for Celestial Synchronization Engine."""
import sys
import time
from pathlib import Path
import importlib.util

SRC = Path(__file__).parent.parent.parent / "src"

def load_module(module_path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

scheduler_mod = load_module(SRC / "celestial-sync-engine" / "astral_scheduler" / "scheduler.py", "scheduler")
wayeb_mod = load_module(SRC / "celestial-sync-engine" / "wayeb_sync" / "wayeb.py", "wayeb")
hooks_mod = load_module(SRC / "celestial-sync-engine" / "temporal_hooks" / "hooks.py", "hooks")

AstralScheduler = scheduler_mod.AstralScheduler
CelestialCycle = scheduler_mod.CelestialCycle
ScheduleEntry = scheduler_mod.ScheduleEntry
WayebSynchronizer = wayeb_mod.WayebSynchronizer
WayebPhase = wayeb_mod.WayebPhase
WayebEvent = wayeb_mod.WayebEvent
TemporalHookRegistry = hooks_mod.TemporalHookRegistry
TemporalHook = hooks_mod.TemporalHook
HookTrigger = hooks_mod.HookTrigger


class TestAstralScheduler:
    def test_creation(self):
        s = AstralScheduler()
        assert s._epoch > 0

    def test_register_entry(self):
        s = AstralScheduler()
        s.register(ScheduleEntry(entry_id="t1", cycle=CelestialCycle.SOLAR, callback_ref="f", phase_offset=0.5))
        assert s.export_state()["entry_count"] == 1

    def test_unregister(self):
        s = AstralScheduler()
        s.register(ScheduleEntry(entry_id="x", cycle=CelestialCycle.LUNAR, callback_ref="f"))
        assert s.unregister("x") is True
        assert s.unregister("y") is False

    def test_phase_calculation(self):
        s = AstralScheduler(epoch=time.time() - 43200)
        phase = s.get_phase(CelestialCycle.SOLAR)
        assert 0.45 < phase < 0.55

    def test_phi_phase(self):
        s = AstralScheduler(epoch=time.time() - 100)
        assert 0.0 <= s.get_phase(CelestialCycle.PHI) < 1.0

    def test_fire(self):
        s = AstralScheduler()
        s.register(ScheduleEntry(entry_id="f1", cycle=CelestialCycle.WAYEB, callback_ref="f"))
        assert s.fire("f1") is True
        assert s.fire("no") is False
        assert s.export_state()["entries"]["f1"]["fire_count"] == 1


class TestWayebSynchronizer:
    def test_creation(self):
        sync = WayebSynchronizer()
        assert sync.current_phase in list(WayebPhase)

    def test_phase_progress(self):
        assert 0.0 <= WayebSynchronizer().phase_progress <= 1.0

    def test_cycle_number(self):
        sync = WayebSynchronizer(cycle_start=time.time() - 500000)
        assert sync.cycle_number >= 1

    def test_register_event(self):
        sync = WayebSynchronizer()
        sync.register_event(WayebEvent(event_id="e1", phase=WayebPhase.CONSOLIDATION, action="compact", target_module="mem"))
        total = sum(len(sync._events[p]) for p in WayebPhase)
        assert total >= 1

    def test_mark_executed(self):
        sync = WayebSynchronizer()
        sync.register_event(WayebEvent(event_id="ex", phase=sync.current_phase, action="t", target_module="t"))
        assert sync.mark_executed("ex") is True
        assert sync.mark_executed("no") is False

    def test_maintenance_window(self):
        assert isinstance(WayebSynchronizer().is_maintenance_window(), bool)

    def test_export_state(self):
        state = WayebSynchronizer().export_state()
        assert "current_phase" in state and "active" in state

    def test_reset_cycle(self):
        sync = WayebSynchronizer(cycle_start=time.time() - 1000000)
        sync.reset_cycle()
        assert sync.cycle_number == 0


class TestTemporalHookRegistry:
    def test_creation(self):
        assert TemporalHookRegistry().export_state()["total_hooks"] == 0

    def test_register_hook(self):
        r = TemporalHookRegistry()
        r.register(TemporalHook(hook_id="h1", trigger=HookTrigger.PHASE_ENTER, target_module="g", action="re"))
        assert r.export_state()["total_hooks"] == 1

    def test_get_ready_hooks(self):
        r = TemporalHookRegistry()
        r.register(TemporalHook(hook_id="rh", trigger=HookTrigger.CYCLE_COMPLETE, target_module="s", action="n"))
        assert len(r.get_ready_hooks(HookTrigger.CYCLE_COMPLETE)) == 1

    def test_fire_hook(self):
        r = TemporalHookRegistry()
        r.register(TemporalHook(hook_id="fh", trigger=HookTrigger.INTERVAL, target_module="t", action="t"))
        assert r.fire("fh") is True
        assert r.export_state()["hooks"]["fh"]["fires"] == 1

    def test_cooldown(self):
        r = TemporalHookRegistry()
        r.register(TemporalHook(hook_id="ch", trigger=HookTrigger.INTERVAL, target_module="t", action="t", cooldown_seconds=9999))
        r.fire("ch")
        assert len(r.get_ready_hooks(HookTrigger.INTERVAL)) == 0

    def test_unregister(self):
        r = TemporalHookRegistry()
        r.register(TemporalHook(hook_id="rm", trigger=HookTrigger.THRESHOLD, target_module="t", action="a"))
        assert r.unregister("rm") is True
        assert r.unregister("rm") is False
