"""
FFI layer for cross-language governance calls.
Bridges JS/TS governance bindings back to the Python core engine via IPC or HTTP.
"""

import json
import subprocess
from typing import Optional, Dict, Any
from ..core.governance_engine import ParralaxGovernanceEngine, GovernanceContext, PolicyVerdict


class GovernanceFFI:
    """Foreign Function Interface for governance engine cross-language access."""

    def __init__(self, engine: ParralaxGovernanceEngine):
        self._engine = engine

    def evaluate_from_json(self, context_json: str) -> str:
        """Accept a JSON-encoded context, return JSON-encoded verdict."""
        data = json.loads(context_json)
        ctx = GovernanceContext(
            actor_id=data["actor_id"],
            resource_path=data["resource_path"],
            action=data["action"],
            metadata=data.get("metadata", {}),
        )
        verdict = self._engine.evaluate(ctx)
        return json.dumps({
            "verdict": verdict.value,
            "context_hash": ctx.provenance_hash,
        })

    def export_for_motoko(self) -> str:
        return self._engine.export_state()

    def export_for_js(self) -> Dict[str, Any]:
        return json.loads(self._engine.export_state())
