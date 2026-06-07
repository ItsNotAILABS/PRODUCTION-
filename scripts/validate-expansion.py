#!/usr/bin/env python3
"""Expansion Validation Script"""
import os, sys, json
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "src"

REQUIRED_MODULES = [
    "parralax-governance-sdk/__init__.py",
    "parralax-governance-sdk/core/__init__.py",
    "parralax-governance-sdk/core/governance_engine.py",
    "parralax-governance-sdk/bindings/__init__.py",
    "parralax-governance-sdk/bindings/python_ffi.py",
    "parralax-governance-sdk/bindings/motoko_bridge.ts",
    "parralax-governance-sdk/policies/default_policies.json",
    "celestial-sync-engine/__init__.py",
    "celestial-sync-engine/astral_scheduler/__init__.py",
    "celestial-sync-engine/astral_scheduler/scheduler.py",
    "celestial-sync-engine/wayeb_sync/__init__.py",
    "celestial-sync-engine/wayeb_sync/wayeb.py",
    "celestial-sync-engine/temporal_hooks/__init__.py",
    "celestial-sync-engine/temporal_hooks/hooks.py",
    "mesie-bridge/__init__.py",
    "mesie-bridge/conduit/__init__.py",
    "mesie-bridge/conduit/mesie_conduit.py",
    "mesie-bridge/spectral_io/__init__.py",
    "mesie-bridge/spectral_io/io_manager.py",
    "mesie-bridge/fastapi_adapters/__init__.py",
    "mesie-bridge/fastapi_adapters/adapter.py",
    "uncaged-generative-zones/__init__.py",
    "uncaged-generative-zones/mini-brains/__init__.py",
    "uncaged-generative-zones/mini-brains/brain_core.py",
    "uncaged-generative-zones/mini-brains/alpha/config.json",
    "uncaged-generative-zones/mini-brains/beta/config.json",
    "uncaged-generative-zones/mini-brains/gamma/config.json",
    "uncaged-generative-zones/execution-sandboxes/sandbox_runtime.py",
    "uncaged-generative-zones/circuit-bypass/bypass_controller.py",
    "uncaged-generative-zones/zone_orchestrator.py",
]

def main():
    errors = []
    for mod in REQUIRED_MODULES:
        if not (SRC / mod).exists():
            errors.append(f"MISSING: {mod}")
    for mod in REQUIRED_MODULES:
        if mod.endswith(".json") and (SRC / mod).exists():
            try:
                json.loads((SRC / mod).read_text())
            except:
                errors.append(f"INVALID JSON: {mod}")
    for mod in REQUIRED_MODULES:
        if mod.endswith(".py") and (SRC / mod).exists():
            try:
                compile((SRC / mod).read_text(), mod, "exec")
            except SyntaxError as e:
                errors.append(f"SYNTAX: {mod} - {e}")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)
    print(f"  ALL {len(REQUIRED_MODULES)} modules validated OK")

if __name__ == "__main__":
    main()
