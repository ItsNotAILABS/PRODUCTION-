"""
Platform Fleet Targets — deployment target type system.

A "target" is what SUSE Rancher calls a "cluster".
We support four target classes: Cloudflare Edge, ICP Canister, Lambda Function,
and Bare-Metal/VM. Each target self-reports health via heartbeat pings.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional


class TargetClass(Enum):
    CLOUDFLARE_WORKER = "cloudflare_worker"
    ICP_CANISTER      = "icp_canister"
    LAMBDA_FUNCTION   = "lambda_function"
    EDGE_FUNCTION     = "edge_function"
    BARE_METAL        = "bare_metal"


class TargetStatus(Enum):
    HEALTHY    = "healthy"
    DEGRADED   = "degraded"
    UNREACHABLE = "unreachable"
    PROVISIONING = "provisioning"
    DECOMMISSIONED = "decommissioned"


@dataclass
class TargetCapacity:
    cpu_millicores: int = 0         # 0 = serverless (no limit)
    memory_mb: int = 0
    max_concurrent_requests: int = 1000
    regions: List[str] = field(default_factory=list)


@dataclass
class Target:
    target_id: str
    name: str
    target_class: TargetClass
    endpoint: str
    account_id: str

    status: TargetStatus = TargetStatus.PROVISIONING
    capacity: TargetCapacity = field(default_factory=TargetCapacity)
    labels: Dict[str, str] = field(default_factory=dict)
    annotations: Dict[str, str] = field(default_factory=dict)

    registered_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    heartbeat_latency_ms: float = 0.0

    phi_score: float = 1.0          # deployment priority weight
    deployed_workloads: List[str] = field(default_factory=list)

    @property
    def is_alive(self) -> bool:
        return time.time() - self.last_heartbeat < 30.0

    @property
    def age_s(self) -> float:
        return time.time() - self.registered_at

    def record_heartbeat(self, latency_ms: float = 0.0) -> None:
        self.last_heartbeat = time.time()
        self.heartbeat_latency_ms = latency_ms
        self.status = TargetStatus.HEALTHY

    def mark_degraded(self) -> None:
        self.status = TargetStatus.DEGRADED

    def to_dict(self) -> dict:
        return {
            "target_id":        self.target_id,
            "name":             self.name,
            "class":            self.target_class.value,
            "endpoint":         self.endpoint,
            "status":           self.status.value,
            "phi_score":        self.phi_score,
            "heartbeat_latency_ms": self.heartbeat_latency_ms,
            "is_alive":         self.is_alive,
            "deployed_count":   len(self.deployed_workloads),
            "labels":           self.labels,
            "regions":          self.capacity.regions,
        }


@dataclass
class CloudflareTarget(Target):
    account_id: str = ""
    zone_id: str = ""
    workers_subdomain: str = ""

    def __post_init__(self):
        self.target_class = TargetClass.CLOUDFLARE_WORKER
        if not self.capacity.regions:
            self.capacity.regions = ["global"]


@dataclass
class ICPTarget(Target):
    canister_id: str = ""
    dfx_network: str = "ic"
    subnet: str = ""

    def __post_init__(self):
        self.target_class = TargetClass.ICP_CANISTER
        if not self.capacity.regions:
            self.capacity.regions = ["icp-mainnet"]


def make_cloudflare_target(name: str, account_id: str, subdomain: str) -> CloudflareTarget:
    return CloudflareTarget(
        target_id=f"cf-{name.lower().replace(' ', '-')}",
        name=name,
        target_class=TargetClass.CLOUDFLARE_WORKER,
        endpoint=f"https://{subdomain}.workers.dev",
        account_id=account_id,
        workers_subdomain=subdomain,
    )


def make_icp_target(name: str, canister_id: str, network: str = "ic") -> ICPTarget:
    return ICPTarget(
        target_id=f"icp-{canister_id[:8]}",
        name=name,
        target_class=TargetClass.ICP_CANISTER,
        endpoint=f"https://{canister_id}.icp0.io",
        account_id="",
        canister_id=canister_id,
        dfx_network=network,
    )
