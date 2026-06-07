"""Tests for Parralax Governance SDK core engine."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))
import importlib.util

def load_module(module_path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

SRC = Path(__file__).parent.parent.parent / "src"
engine_mod = load_module(SRC / "parralax-governance-sdk" / "core" / "governance_engine.py", "governance_engine")

ParralaxGovernanceEngine = engine_mod.ParralaxGovernanceEngine
GovernanceContext = engine_mod.GovernanceContext
GovernanceMode = engine_mod.GovernanceMode
PolicyRule = engine_mod.PolicyRule
PolicyVerdict = engine_mod.PolicyVerdict


class TestGovernanceContext:
    def test_context_creation(self):
        ctx = GovernanceContext(actor_id="agent-alpha", resource_path="sovereign://data/research", action="read")
        assert ctx.actor_id == "agent-alpha"
        assert len(ctx.provenance_hash) == 16

    def test_context_provenance_uniqueness(self):
        ctx1 = GovernanceContext(actor_id="a", resource_path="r", action="x")
        ctx2 = GovernanceContext(actor_id="a", resource_path="r", action="y")
        assert ctx1.provenance_hash != ctx2.provenance_hash


class TestParralaxGovernanceEngine:
    def test_engine_creation(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.SOVEREIGN)
        assert engine.mode == GovernanceMode.SOVEREIGN

    def test_register_policy(self):
        engine = ParralaxGovernanceEngine()
        rule = PolicyRule(rule_id="TEST_RULE", description="Test", mode=GovernanceMode.SOVEREIGN, conditions={"resource_prefix": "sovereign://"}, verdict=PolicyVerdict.ALLOW, priority=10)
        engine.register_policy(rule)
        import json
        assert json.loads(engine.export_state())["policy_count"] == 1

    def test_evaluate_matching_policy(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.SOVEREIGN)
        rule = PolicyRule(rule_id="ALLOW", description="Allow", mode=GovernanceMode.SOVEREIGN, conditions={"resource_prefix": "sovereign://"}, verdict=PolicyVerdict.ALLOW, priority=10)
        engine.register_policy(rule)
        ctx = GovernanceContext(actor_id="owner", resource_path="sovereign://data", action="write")
        assert engine.evaluate(ctx) == PolicyVerdict.ALLOW

    def test_evaluate_no_match_escalates(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.SOVEREIGN)
        ctx = GovernanceContext(actor_id="unknown", resource_path="external://x", action="read")
        assert engine.evaluate(ctx) == PolicyVerdict.ESCALATE

    def test_evaluate_deny_policy(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.AUTONOMOUS)
        rule = PolicyRule(rule_id="DENY", description="Deny CI/CD", mode=GovernanceMode.AUTONOMOUS, conditions={"resource_prefix": "pipeline://cicd/", "action": "write"}, verdict=PolicyVerdict.DENY, priority=95)
        engine.register_policy(rule)
        ctx = GovernanceContext(actor_id="mini-brain", resource_path="pipeline://cicd/deploy", action="write")
        assert engine.evaluate(ctx) == PolicyVerdict.DENY

    def test_audit_trail(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.SOVEREIGN)
        rule = PolicyRule(rule_id="T", description="T", mode=GovernanceMode.SOVEREIGN, conditions={}, verdict=PolicyVerdict.ALLOW)
        engine.register_policy(rule)
        engine.evaluate(GovernanceContext(actor_id="a", resource_path="r", action="x"))
        trail = engine.get_audit_trail()
        assert len(trail) == 1
        assert trail[0]["verdict"] == "allow"

    def test_priority_ordering(self):
        engine = ParralaxGovernanceEngine(mode=GovernanceMode.SOVEREIGN)
        engine.register_policy(PolicyRule(rule_id="LOW", description="L", mode=GovernanceMode.SOVEREIGN, conditions={"resource_prefix": "data://"}, verdict=PolicyVerdict.DENY, priority=1))
        engine.register_policy(PolicyRule(rule_id="HIGH", description="H", mode=GovernanceMode.SOVEREIGN, conditions={"resource_prefix": "data://"}, verdict=PolicyVerdict.ALLOW, priority=100))
        ctx = GovernanceContext(actor_id="a", resource_path="data://x", action="r")
        assert engine.evaluate(ctx) == PolicyVerdict.ALLOW

    def test_bind_atlas_registry(self):
        engine = ParralaxGovernanceEngine()
        engine.bind_atlas_registry("sdk/governance/atlas-registry.js")
        import json
        assert json.loads(engine.export_state())["atlas_ref"] == "sdk/governance/atlas-registry.js"
