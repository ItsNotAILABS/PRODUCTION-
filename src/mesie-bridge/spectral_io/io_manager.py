"""
Spectral I/O Manager - Serialization and format translation for MESIE.
"""

from typing import Dict, Any, Optional, List
import json
import hashlib
import time


class SpectralIOManager:
    SUPPORTED_FORMATS = ["json", "msgpack", "protobuf", "spectral-binary"]
    DEFAULT_FORMAT = "json"

    def __init__(self, preferred_format: str = "json"):
        if preferred_format not in self.SUPPORTED_FORMATS:
            preferred_format = self.DEFAULT_FORMAT
        self._format = preferred_format
        self._encoding_stats: Dict[str, int] = {"encoded": 0, "decoded": 0, "errors": 0}

    def encode(self, data: Dict[str, Any], channel_id: Optional[str] = None) -> bytes:
        envelope = {
            "format": self._format,
            "channel": channel_id or "default",
            "timestamp": time.time(),
            "checksum": self._compute_checksum(data),
            "payload": data,
        }
        encoded = json.dumps(envelope).encode("utf-8")
        self._encoding_stats["encoded"] += 1
        return encoded

    def decode(self, raw: bytes) -> Optional[Dict[str, Any]]:
        try:
            envelope = json.loads(raw.decode("utf-8"))
            if "checksum" in envelope and "payload" in envelope:
                expected = self._compute_checksum(envelope["payload"])
                if envelope["checksum"] != expected:
                    self._encoding_stats["errors"] += 1
                    return None
            self._encoding_stats["decoded"] += 1
            return envelope.get("payload", envelope)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._encoding_stats["errors"] += 1
            return None

    def encode_batch(self, items: List[Dict[str, Any]], channel_id: Optional[str] = None) -> bytes:
        batch_envelope = {
            "format": self._format,
            "channel": channel_id or "default",
            "batch": True,
            "count": len(items),
            "timestamp": time.time(),
            "items": items,
        }
        return json.dumps(batch_envelope).encode("utf-8")

    def get_stats(self) -> Dict[str, int]:
        return self._encoding_stats.copy()

    def _compute_checksum(self, data: Dict[str, Any]) -> str:
        serialized = json.dumps(data, sort_keys=True).encode("utf-8")
        return hashlib.md5(serialized).hexdigest()[:8]
