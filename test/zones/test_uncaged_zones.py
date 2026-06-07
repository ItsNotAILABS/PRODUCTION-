"""Tests for Uncaged Generative Zones."""
import sys
import json
from pathlib import Path
import importlib.util

SRC = Path(__file__).parent.parent.parent / "src"

def load_module(module_path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

brain_mod = load_module(SRC / "uncaged-generative-zones" / "mini-brains" / "brain_core.py", "brain_core")
sandbox_mod = load_module(SRC / "uncaged-generative-zones" / "execution-sandboxes" / "sandbox_runtime.py", "sandbox_runtime")
bypass_mod = load_module(SRC / "uncaged-generative-zones" / "circuit-bypass" / "bypass_controller.py", "bypass_controller")
orch_mod = load_module(SRC / "uncaged-generative-zones" / "zone_orchestrator.py", "zone_orchestrator")

MiniBrain = brain_mod.MiniBrain
BrainState = brain_mod.BrainState
BrainCapability = brain_mod.BrainCapability
SandboxRuntime = sandbox_mod.SandboxRuntime
SandboxConfig = sandbox_mod.SandboxConfig
IsolationLevel = sandbox_mod.IsolationLevel
CircuitBypassController = bypass_mod.CircuitBypassController
BypassRoute = bypass_mod.BypassRoute
BreakerState = bypass_mod.BreakerState
ZoneOrchestrator = orch_mod.ZoneOrchestrator


class TestMiniBrain:
    def test_creation(self):
        b = MiniBrain(brain_id="a1", designation="alpha", capabilities=[BrainCapability.RESEARCH])
        assert b.state == BrainState.DORMANT

    def test_activation(self):
        b = MiniBrain(brain_id="b1", designation="beta")
        assert b.activate() is True
        assert b.state == BrainState.ACTIVE
        assert b.activate() is False

    def test_research_cycle(self):
        b = MiniBrain(brain_id="r1", designation="alpha")
        b.activate()
        assert b.begin_research("topic") != ""
        assert b.state == BrainState.RESEARCHING

    def test_research_requires_active(self):
        assert MiniBrain(brain_id="r2", designation="b").begin_research("t") == ""

    def test_produce_artifact(self):
        b = MiniBrain(brain_id="a1", designation="a")
        b.activate()
        b.begin_research("t")
        art = b.produce_artifact("F1", {"r": "s"}, 0.85)
        assert art is not None and art.confidence == 0.85

    def test_produce_requires_research(self):
        b = MiniBrain(brain_id="a2", designation="b")
        b.activate()
        assert b.produce_artifact("x", {}) is None

    def test_push_to_staging(self):
        b = MiniBrain(brain_id="p1", designation="g")
        b.activate()
        b.begin_research("push")
        b.produce_artifact("a1", {})
        b.produce_artifact("a2", {})
        assert len(b.push_to_staging()) == 2
        assert all(a.pushed for a in b.artifacts)

    def test_deactivate(self):
        b = MiniBrain(brain_id="d1", designation="a")
        b.activate()
        b.deactivate()
        assert b.state == BrainState.DORMANT

    def test_export_state(self):
        s = MiniBrain(brain_id="e1", designation="g", capabilities=[BrainCapability.EXPLORATION]).export_state()
        assert s["brain_id"] == "e1" and "exploration" in s["capabilities"]


class TestSandboxRuntime:
    def test_create(self):
        r = SandboxRuntime()
        assert r.create_sandbox(SandboxConfig(sandbox_id="s1")) == "s1"

    def test_execute_success(self):
        r = SandboxRuntime()
        r.create_sandbox(SandboxConfig(sandbox_id="e1"))
        res = r.execute("e1", {"type": "r", "expected_artifacts": 3})
        assert res.success is True and res.artifacts_produced == 3

    def test_execute_missing(self):
        res = SandboxRuntime().execute("no", {})
        assert res.success is False

    def test_destroy(self):
        r = SandboxRuntime()
        r.create_sandbox(SandboxConfig(sandbox_id="d1"))
        assert r.destroy_sandbox("d1") is True
        assert r.destroy_sandbox("d1") is False


class TestCircuitBypassController:
    def test_register_bypass(self):
        c = CircuitBypassController()
        r = BypassRoute(route_id="r1", source_zone="zone://uncaged/mini-brains/a", target="stg", bypassed_breakers=["x"], governance_approval="POLICY")
        assert c.register_bypass(r) is True

    def test_reject_no_governance(self):
        c = CircuitBypassController()
        r = BypassRoute(route_id="r2", source_zone="zone://uncaged/mini-brains/", target="t", bypassed_breakers=[], governance_approval="")
        assert c.register_bypass(r) is False

    def test_reject_unauthorized_zone(self):
        c = CircuitBypassController()
        r = BypassRoute(route_id="r3", source_zone="zone://production/", target="t", bypassed_breakers=[], governance_approval="P")
        assert c.register_bypass(r) is False

    def test_can_bypass(self):
        c = CircuitBypassController()
        c.register_bypass(BypassRoute(route_id="r4", source_zone="zone://uncaged/research-push/", target="stg", bypassed_breakers=["ci"], governance_approval="RP"))
        assert c.can_bypass("zone://uncaged/research-push/a1", "stg") is True
        assert c.can_bypass("zone://other/", "stg") is False

    def test_attempt_bypass(self):
        c = CircuitBypassController()
        c.register_bypass(BypassRoute(route_id="r5", source_zone="zone://uncaged/mini-brains/", target="r", bypassed_breakers=["g"], governance_approval="S"))
        r = c.attempt_passage("zone://uncaged/mini-brains/a", "r", "push")
        assert r["allowed"] is True and r["method"] == "bypass"

    def test_attempt_blocked(self):
        c = CircuitBypassController()
        c.register_breaker("g1", BreakerState.OPEN)
        r = c.attempt_passage("zone://ext/", "prod", "deploy")
        assert r["allowed"] is False


class TestZoneOrchestrator:
    def test_creation(self):
        assert ZoneOrchestrator().get_metrics()["active_brains"] == 0

    def test_register_activate(self):
        o = ZoneOrchestrator()
        o.initialize()
        o.register_brain("a1", {})
        assert o.activate_brain("a1") is True
        assert o.get_metrics()["active_brains"] == 1

    def test_activate_unregistered(self):
        assert ZoneOrchestrator().activate_brain("no") is False

    def test_submit_research(self):
        o = ZoneOrchestrator()
        o.register_brain("b1", {})
        tid = o.submit_research("b1", "topic")
        assert tid.startswith("research-b1-")

    def test_push_artifacts(self):
        o = ZoneOrchestrator()
        assert o.push_artifacts("a1", [{"t": "A"}, {"t": "B"}]) == 2
        m = o.get_metrics()
        assert m["pushed_artifacts"] == 2 and m["bypasses_used"] == 2

    def test_export_state(self):
        o = ZoneOrchestrator()
        o.register_brain("x", {"test": True})
        s = json.loads(o.export_full_state())
        assert "x" in s["brains"]


class TestMiniBrainConfigs:
    def test_alpha(self):
        with open(SRC / "uncaged-generative-zones" / "mini-brains" / "alpha" / "config.json") as f:
            c = json.load(f)
        assert c["brain_id"] == "alpha-001" and c["ci_cd_bypass"] is True

    def test_beta(self):
        with open(SRC / "uncaged-generative-zones" / "mini-brains" / "beta" / "config.json") as f:
            c = json.load(f)
        assert c["isolation_level"] == "partial"

    def test_gamma(self):
        with open(SRC / "uncaged-generative-zones" / "mini-brains" / "gamma" / "config.json") as f:
            c = json.load(f)
        assert c["max_artifacts_per_cycle"] == 20
