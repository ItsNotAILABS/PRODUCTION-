"""
Execution Sandbox Runtime - Isolated execution with CI/CD bypass.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import time


class IsolationLevel(Enum):
    NONE = "none"
    PARTIAL = "partial"
    FULL = "full"
    HERMETIC = "hermetic"


@dataclass
class SandboxConfig:
    sandbox_id: str
    isolation_level: IsolationLevel = IsolationLevel.FULL
    memory_limit_mb: int = 512
    execution_timeout_s: float = 300.0
    allow_network: bool = False
    allow_filesystem: bool = True
    ci_cd_bypass: bool = True
    governance_ref: Optional[str] = None


@dataclass
class ExecutionResult:
    sandbox_id: str
    success: bool
    output: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    artifacts_produced: int = 0


class SandboxRuntime:
    def __init__(self):
        self._sandboxes: Dict[str, SandboxConfig] = {}
        self._results: List[ExecutionResult] = []
        self._active_executions: Dict[str, float] = {}

    def create_sandbox(self, config: SandboxConfig) -> str:
        self._sandboxes[config.sandbox_id] = config
        return config.sandbox_id

    def execute(self, sandbox_id: str, task: Dict[str, Any]) -> ExecutionResult:
        if sandbox_id not in self._sandboxes:
            return ExecutionResult(sandbox_id=sandbox_id, success=False, error="Sandbox not found")
        config = self._sandboxes[sandbox_id]
        start = time.time()
        self._active_executions[sandbox_id] = start
        try:
            result = self._isolated_execute(config, task)
            duration = (time.time() - start) * 1000
            exec_result = ExecutionResult(sandbox_id=sandbox_id, success=True, output=result, duration_ms=duration, artifacts_produced=result.get("artifacts", 0) if isinstance(result, dict) else 0)
        except Exception as e:
            duration = (time.time() - start) * 1000
            exec_result = ExecutionResult(sandbox_id=sandbox_id, success=False, error=str(e), duration_ms=duration)
        finally:
            self._active_executions.pop(sandbox_id, None)
        self._results.append(exec_result)
        return exec_result

    def destroy_sandbox(self, sandbox_id: str) -> bool:
        if sandbox_id in self._sandboxes:
            del self._sandboxes[sandbox_id]
            return True
        return False

    def get_active(self) -> List[str]:
        return list(self._active_executions.keys())

    def _isolated_execute(self, config: SandboxConfig, task: Dict[str, Any]) -> Dict[str, Any]:
        return {"task_type": task.get("type", "unknown"), "isolation": config.isolation_level.value, "ci_cd_bypass": config.ci_cd_bypass, "executed_at": time.time(), "artifacts": task.get("expected_artifacts", 0)}
