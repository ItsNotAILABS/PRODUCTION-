"""
DeployAgent — the autonomous handler that owns a deployment's lifecycle.
═══════════════════════════════════════════════════════════════════════

The orchestrator decides WHAT to deploy WHERE and gates it on fleet
coherence. The DeployAgent owns the HOW of a single deploy, end to end:

    validate → deploy (real, via DeployExecutor) → verify → rollback-on-fail

Each step is real, not simulated:
  - validate: the workload has an image_ref and the target is alive.
  - deploy:   DeployExecutor runs the actual CLI (or honestly stages).
  - verify:   after a real deploy, HTTP-GET the target endpoint and require
              a 2xx — a deploy that "succeeded" but serves errors is a
              failed deploy. Verification is skipped for staged deploys
              (nothing was pushed to check).
  - rollback: if verification fails, invoke the caller-supplied rollback so
              the fleet isn't left serving a broken deploy.

Returns a structured result the orchestrator maps to a workload phase.
Stdlib only (urllib for the health check) — no new dependencies.
"""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Optional

from .executor import DeployExecutor, DeployOutcome


@dataclass
class DeployReport:
    workload_id: str
    target_id: str
    outcome: str                 # deployed | staged | failed
    steps: list = field(default_factory=list)   # [{step, ok, detail}]
    verified: Optional[bool] = None
    rolled_back: bool = False
    duration_ms: float = 0.0

    def to_dict(self) -> dict:
        return {
            "workload_id": self.workload_id,
            "target_id": self.target_id,
            "outcome": self.outcome,
            "verified": self.verified,
            "rolled_back": self.rolled_back,
            "duration_ms": round(self.duration_ms, 1),
            "steps": self.steps,
        }


class DeployAgent:
    def __init__(self, executor: Optional[DeployExecutor] = None, *,
                 verify: bool = True, verify_timeout: float = 5.0,
                 rollback_fn: Optional[Callable[[str], bool]] = None) -> None:
        self.executor = executor or DeployExecutor()
        self.verify = verify
        self.verify_timeout = verify_timeout
        self.rollback_fn = rollback_fn

    def execute(self, workload, target) -> DeployReport:
        start = time.time()
        report = DeployReport(
            workload_id=getattr(workload, "workload_id", "?"),
            target_id=getattr(target, "target_id", "?"),
            outcome="failed",
        )

        # ── validate ──────────────────────────────────────────────────
        if not getattr(workload, "image_ref", ""):
            report.steps.append({"step": "validate", "ok": False, "detail": "workload has no image_ref"})
            report.outcome = "failed"
            report.duration_ms = (time.time() - start) * 1000
            return report
        if not getattr(target, "is_alive", True):
            report.steps.append({"step": "validate", "ok": False, "detail": "target is not alive"})
            report.outcome = "failed"
            report.duration_ms = (time.time() - start) * 1000
            return report
        report.steps.append({"step": "validate", "ok": True, "detail": "workload + target ready"})

        # ── deploy (real) ─────────────────────────────────────────────
        outcome: DeployOutcome = self.executor.deploy(workload, target)
        report.steps.append({"step": "deploy", "ok": outcome.ok, "detail": outcome.detail,
                             "command": outcome.command})
        report.outcome = outcome.outcome

        if outcome.outcome == "staged":
            # Nothing pushed → nothing to verify. Honest terminal state.
            report.duration_ms = (time.time() - start) * 1000
            return report
        if outcome.outcome == "failed":
            report.duration_ms = (time.time() - start) * 1000
            return report

        # ── verify (real health check) ────────────────────────────────
        if self.verify:
            endpoint = getattr(target, "endpoint", "")
            ok, detail = self._verify_endpoint(endpoint)
            report.verified = ok
            report.steps.append({"step": "verify", "ok": ok, "detail": detail})
            if not ok:
                # ── rollback ──────────────────────────────────────────
                if self.rollback_fn is not None:
                    rolled = bool(self.rollback_fn(report.workload_id))
                    report.rolled_back = rolled
                    report.steps.append({"step": "rollback", "ok": rolled,
                                        "detail": "verification failed; rolled back" if rolled
                                        else "verification failed; rollback returned false"})
                report.outcome = "failed"

        report.duration_ms = (time.time() - start) * 1000
        return report

    def _verify_endpoint(self, endpoint: str) -> tuple[bool, str]:
        if not endpoint:
            return False, "no endpoint to verify"
        # Try /health first, then the root.
        for suffix in ("/health", "/"):
            url = endpoint.rstrip("/") + suffix
            try:
                with urllib.request.urlopen(url, timeout=self.verify_timeout) as resp:
                    if 200 <= resp.status < 300:
                        return True, f"{url} → {resp.status}"
            except urllib.error.HTTPError as e:
                if suffix == "/":
                    return False, f"{url} → HTTP {e.code}"
            except Exception as e:  # noqa: BLE001
                if suffix == "/":
                    return False, f"{url} unreachable: {e}"
        return False, f"{endpoint} did not return 2xx"
