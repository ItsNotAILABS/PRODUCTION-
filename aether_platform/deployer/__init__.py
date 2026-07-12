"""
Aether deployer — real deployment execution + the agent that owns the
deploy lifecycle (validate → deploy → verify → rollback).

Distinct from aether_platform/deploy/, which holds host-provisioning
scripts (systemd unit, nginx, deploy.sh) for standing up the platform
itself. This module is the runtime that actually ships workloads to
targets when the orchestrator schedules them.
"""

from .executor import DeployExecutor, DeployOutcome, tool_available
from .agent import DeployAgent, DeployReport

__all__ = [
    "DeployExecutor", "DeployOutcome", "tool_available",
    "DeployAgent", "DeployReport",
]
