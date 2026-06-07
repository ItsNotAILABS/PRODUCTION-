"""
MESIE Conduit - Primary integration channel between PRODUCTION- and MESIE.
Handles spectral data routing, element registration, and bidirectional sync.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
import json
import time
import hashlib


class SpectralChannel(Enum):
    INFRARED = "infrared"
    VISIBLE = "visible"
    ULTRAVIOLET = "ultraviolet"
    XRAY = "xray"
    GAMMA = "gamma"


class ElementType(Enum):
    PROCESSOR = "processor"
    ANALYZER = "analyzer"
    SYNTHESIZER = "synthesizer"
    TRANSFORMER = "transformer"
    OBSERVER = "observer"


@dataclass
class ConduitConfig:
    mesie_endpoint: str = "http://localhost:8100/mesie/v1"
    fastapi_base: str = "http://localhost:8000"
    max_retries: int = 3
    timeout_seconds: float = 30.0
    buffer_size: int = 1000
    isolation_mode: bool = True
    channels: List[SpectralChannel] = field(default_factory=lambda: [SpectralChannel.VISIBLE])


@dataclass
class SpectralMessage:
    message_id: str
    channel: SpectralChannel
    source: str
    destination: str
    payload: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    ttl: int = 300
    acknowledged: bool = False


class MESIEConduit:
    def __init__(self, config: Optional[ConduitConfig] = None):
        self._config = config or ConduitConfig()
        self._message_buffer: List[SpectralMessage] = []
        self._registered_elements: Dict[str, ElementType] = {}
        self._channel_stats: Dict[SpectralChannel, Dict[str, int]] = {
            ch: {"sent": 0, "received": 0, "errors": 0} for ch in SpectralChannel
        }
        self._connected: bool = False
        self._error_log: List[Dict[str, Any]] = []

    def connect(self) -> bool:
        self._connected = True
        return True

    def disconnect(self) -> None:
        self._flush_buffer()
        self._connected = False

    def register_element(self, element_id: str, element_type: ElementType) -> bool:
        self._registered_elements[element_id] = element_type
        return True

    def send(self, channel: SpectralChannel, destination: str, payload: Dict[str, Any], source: str = "production-core") -> Optional[str]:
        if not self._connected:
            self._log_error("send", "Conduit not connected")
            return None
        msg_id = self._generate_id(destination, payload)
        message = SpectralMessage(message_id=msg_id, channel=channel, source=source, destination=destination, payload=payload)
        if len(self._message_buffer) >= self._config.buffer_size:
            self._flush_buffer()
        self._message_buffer.append(message)
        self._channel_stats[channel]["sent"] += 1
        return msg_id

    def receive(self, channel: Optional[SpectralChannel] = None) -> List[SpectralMessage]:
        messages = []
        for msg in self._message_buffer:
            if msg.acknowledged:
                continue
            if channel and msg.channel != channel:
                continue
            messages.append(msg)
            if channel:
                self._channel_stats[channel]["received"] += 1
        return messages

    def acknowledge(self, message_id: str) -> bool:
        for msg in self._message_buffer:
            if msg.message_id == message_id:
                msg.acknowledged = True
                return True
        return False

    def route_from_fastapi(self, endpoint: str, method: str, payload: Dict[str, Any]) -> Optional[str]:
        channel = self._determine_channel(endpoint, method)
        destination = self._resolve_mesie_target(endpoint)
        return self.send(channel=channel, destination=destination, payload={"fastapi_endpoint": endpoint, "method": method, "data": payload, "routed_at": time.time()}, source=f"fastapi:{endpoint}")

    def get_status(self) -> Dict[str, Any]:
        return {
            "connected": self._connected,
            "config": {"mesie_endpoint": self._config.mesie_endpoint, "isolation_mode": self._config.isolation_mode},
            "elements_registered": len(self._registered_elements),
            "buffer_size": len(self._message_buffer),
            "buffer_capacity": self._config.buffer_size,
            "channel_stats": {ch.value: stats for ch, stats in self._channel_stats.items()},
            "errors": len(self._error_log),
        }

    def _determine_channel(self, endpoint: str, method: str) -> SpectralChannel:
        if "/critical/" in endpoint or method == "DELETE":
            return SpectralChannel.GAMMA
        if "/debug/" in endpoint or "/inspect/" in endpoint:
            return SpectralChannel.XRAY
        if "/background/" in endpoint or "/async/" in endpoint:
            return SpectralChannel.INFRARED
        if "/burst/" in endpoint or "/compute/" in endpoint:
            return SpectralChannel.ULTRAVIOLET
        return SpectralChannel.VISIBLE

    def _resolve_mesie_target(self, endpoint: str) -> str:
        parts = endpoint.strip("/").split("/")
        if len(parts) >= 2:
            return f"mesie:{parts[0]}:{parts[1]}"
        return f"mesie:{parts[0] if parts else 'default'}"

    def _flush_buffer(self) -> None:
        self._message_buffer = [msg for msg in self._message_buffer if not msg.acknowledged]

    def _log_error(self, operation: str, message: str) -> None:
        self._error_log.append({"timestamp": time.time(), "operation": operation, "message": message})

    def _generate_id(self, destination: str, payload: Dict[str, Any]) -> str:
        seed = f"{destination}:{json.dumps(payload, sort_keys=True)}:{time.time()}"
        return hashlib.sha256(seed.encode()).hexdigest()[:16]
