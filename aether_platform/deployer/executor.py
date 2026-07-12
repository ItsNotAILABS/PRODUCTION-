"""
Aether deploy executor — the real thing, honestly.
═══════════════════════════════════════════════════════════════════════

Turns a Workload + Target into an ACTUAL deployment by shelling out to the
real CLI for that target class (wrangler for Cloudflare, dfx for ICP, aws
for Lambda). No simulation: it runs the real command, captures the real
output, and reports the real return code.

Honest degradation is a first-class outcome, not a hidden failure:

  - "deployed" — the tool was present, credentials were present, the
    command ran and succeeded.
  - "staged"   — everything is prepared but the deploy was NOT pushed,
    because the required CLI or credential is missing in this
    environment. This is the truthful state in a sandbox with no
    wrangler/dfx and no cloud token. The workload is ready; it just
    hasn't been shipped. Never reported as success.
  - "failed"   — the tool ran and returned non-zero (a real deploy error).

This means the same code path is exercised whether or not credentials are
present: with them, it deploys for real; without, it tells you exactly
what's missing instead of pretending.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Optional

# Imported lazily / by type name to avoid a hard import cycle with the
# orchestrator; the executor only reads a few attributes off these.
try:
    from aether_platform.fleet import TargetClass
except Exception:  # pragma: no cover - fleet always present in practice
    TargetClass = None  # type: ignore


@dataclass
class DeployOutcome:
    outcome: str                 # "deployed" | "staged" | "failed"
    detail: str                  # human-readable explanation
    command: str = ""            # the command that ran (or would have)
    returncode: Optional[int] = None
    stdout: str = ""
    stderr: str = ""

    @property
    def ok(self) -> bool:
        return self.outcome == "deployed"

    def to_dict(self) -> dict:
        return {
            "outcome": self.outcome,
            "detail": self.detail,
            "command": self.command,
            "returncode": self.returncode,
            "stdout_tail": self.stdout[-500:],
            "stderr_tail": self.stderr[-500:],
        }


def tool_available(name: str) -> bool:
    return shutil.which(name) is not None


class DeployExecutor:
    """Runs real deploys. `dry_run=True` reports what it WOULD run without
    executing (useful for tests and previews)."""

    def __init__(self, *, workdir: Optional[str] = None, timeout: float = 300.0,
                 dry_run: bool = False) -> None:
        self.workdir = workdir or os.getcwd()
        self.timeout = timeout
        self.dry_run = dry_run

    # ── Per-class deploy strategies ───────────────────────────────────────

    def deploy(self, workload, target) -> DeployOutcome:
        cls = getattr(target, "target_class", None)
        cls_value = getattr(cls, "value", cls)  # accept enum or raw string

        if cls_value in ("cloudflare_worker", "edge_function"):
            return self._deploy_cloudflare(workload, target)
        if cls_value == "icp_canister":
            return self._deploy_icp(workload, target)
        if cls_value == "lambda_function":
            return self._deploy_lambda(workload, target)
        if cls_value == "bare_metal":
            return DeployOutcome(
                "staged",
                "bare_metal targets are provisioned out-of-band (see aether_platform/deploy/deploy.sh); "
                "nothing to push from the control plane.",
            )
        return DeployOutcome("staged", f"no deploy strategy for target class {cls_value!r}")

    # ── Cloudflare (wrangler) ─────────────────────────────────────────────

    def _deploy_cloudflare(self, workload, target) -> DeployOutcome:
        if not tool_available("wrangler") and not tool_available("npx"):
            return DeployOutcome(
                "staged",
                "wrangler not installed. Install with `npm i -g wrangler` (or ensure npx is available). "
                "Workload is ready; not pushed.",
            )
        if not os.environ.get("CLOUDFLARE_API_TOKEN"):
            return DeployOutcome(
                "staged",
                "CLOUDFLARE_API_TOKEN not set in the environment. Set it to enable a real deploy; "
                "workload is prepared but not pushed.",
            )
        # The workload's image_ref points at a source dir / wrangler project.
        wrangler = "wrangler" if tool_available("wrangler") else "npx wrangler"
        cmd = f"{wrangler} deploy"
        return self._run(cmd)

    # ── ICP (dfx) ─────────────────────────────────────────────────────────

    def _deploy_icp(self, workload, target) -> DeployOutcome:
        if not tool_available("dfx"):
            return DeployOutcome(
                "staged",
                "dfx not installed. Install from https://internetcomputer.org/docs. "
                "Workload is ready; not pushed.",
            )
        network = getattr(target, "dfx_network", "ic")
        cmd = f"dfx deploy --network {network}"
        return self._run(cmd)

    # ── AWS Lambda ────────────────────────────────────────────────────────

    def _deploy_lambda(self, workload, target) -> DeployOutcome:
        if not tool_available("aws"):
            return DeployOutcome("staged", "aws CLI not installed. Workload is ready; not pushed.")
        if not (os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY")):
            return DeployOutcome("staged", "AWS credentials not set. Workload is ready; not pushed.")
        fn = workload.name
        cmd = f"aws lambda update-function-code --function-name {fn} --zip-file fileb://dist/{fn}.zip"
        return self._run(cmd)

    # ── Command runner ────────────────────────────────────────────────────

    def _run(self, cmd: str) -> DeployOutcome:
        if self.dry_run:
            return DeployOutcome("staged", "dry_run: command not executed", command=cmd)
        try:
            proc = subprocess.run(
                cmd, shell=True, cwd=self.workdir, timeout=self.timeout,
                capture_output=True, text=True,
            )
        except subprocess.TimeoutExpired:
            return DeployOutcome("failed", f"deploy timed out after {self.timeout}s", command=cmd)
        except Exception as e:  # noqa: BLE001
            return DeployOutcome("failed", f"deploy could not start: {e}", command=cmd)

        if proc.returncode == 0:
            return DeployOutcome("deployed", "deploy command succeeded", command=cmd,
                                 returncode=0, stdout=proc.stdout, stderr=proc.stderr)
        return DeployOutcome("failed", f"deploy command exited {proc.returncode}", command=cmd,
                             returncode=proc.returncode, stdout=proc.stdout, stderr=proc.stderr)
