"""Nova Workspace Core (PIL 1.0 / Cycle 116 bootstrap).

Native-first local orchestrator for:
- FLOW workflow execution state
- GREX agent registry
- MEDINA-style hash-chained identity/audit log
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
CHAIN_FILE = ROOT / "identity" / "identity_chain.jsonl"
REGISTRY_FILE = ROOT / "agents" / "grex_registry.json"
FLEET_FILE = ROOT / "artifacts" / "WARR_FLEET_STATUS.json"
LOG_FILE = ROOT / "logs" / "cycle_116.log"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _utc_ts() -> int:
    return int(time.time())


@dataclass
class ChainEvent:
    cycle: int
    actor: str
    event: str
    payload: Dict[str, Any]
    prev_hash: str
    hash: str
    ts: int


class IdentityChain:
    def __init__(self, chain_file: Path) -> None:
        self.chain_file = chain_file
        self.chain_file.parent.mkdir(parents=True, exist_ok=True)

    def _read_all(self) -> List[Dict[str, Any]]:
        if not self.chain_file.exists():
            return []
        return [
            json.loads(line)
            for line in self.chain_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def _last_hash(self) -> str:
        events = self._read_all()
        return events[-1]["hash"] if events else _sha256("GENESIS::NOVA::CYCLE116")

    def append(self, cycle: int, actor: str, event: str, payload: Dict[str, Any]) -> ChainEvent:
        prev_hash = self._last_hash()
        ts = _utc_ts()
        event_input = json.dumps(
            {"cycle": cycle, "actor": actor, "event": event, "payload": payload, "prev_hash": prev_hash, "ts": ts},
            sort_keys=True,
        )
        event_hash = _sha256(event_input)
        row = ChainEvent(
            cycle=cycle,
            actor=actor,
            event=event,
            payload=payload,
            prev_hash=prev_hash,
            hash=event_hash,
            ts=ts,
        )
        with self.chain_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")
        return row


class GrexRegistry:
    def __init__(self, registry_file: Path) -> None:
        self.registry_file = registry_file
        self.registry_file.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> Dict[str, Any]:
        if not self.registry_file.exists():
            return {"cycle": 116, "persona": "Warr", "agents": []}
        return json.loads(self.registry_file.read_text(encoding="utf-8"))

    def save(self, data: Dict[str, Any]) -> None:
        self.registry_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


class NovaCore:
    """Lightweight local coordinator for cycle-bounded internal operations."""

    def __init__(self) -> None:
        self.chain = IdentityChain(CHAIN_FILE)
        self.registry = GrexRegistry(REGISTRY_FILE)

    def bootstrap_cycle_116(self) -> Dict[str, Any]:
        reg = self.registry.load()
        fleet = json.loads(FLEET_FILE.read_text(encoding="utf-8"))
        reg["cycle"] = 116
        reg["pil"] = "1.0"
        reg["persona"] = "Warr"
        reg["policy"] = {
            "native_first": True,
            "local_data_ownership": True,
            "air_gap_capable": True,
            "hash_chained_audit": True,
            "cloud_as_last_layer_adapters": ["DNS", "CDN", "SMS", "EMAIL"],
        }
        reg["fleet"] = fleet["devices"]
        self.registry.save(reg)
        chain_event = self.chain.append(
            cycle=116,
            actor="warr",
            event="bootstrap_cycle",
            payload={"persona": "Warr", "devices": len(fleet["devices"]), "pil": "1.0"},
        )
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as log:
            log.write(
                f"[{_utc_ts()}] cycle=116 actor=warr event=bootstrap_cycle "
                f"devices={len(fleet['devices'])} hash={chain_event.hash[:12]}...\n"
            )
        return {"ok": True, "event_hash": chain_event.hash, "agents": len(reg.get("agents", []))}


if __name__ == "__main__":
    print(json.dumps(NovaCore().bootstrap_cycle_116(), indent=2))

