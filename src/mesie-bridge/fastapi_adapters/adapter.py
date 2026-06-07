"""
MESIE FastAPI Adapter - Route decorator and middleware for MESIE integration.
"""

from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
import time


@dataclass
class RouteMapping:
    path: str
    method: str
    mesie_element: str
    spectral_channel: str = "visible"
    passthrough: bool = False


@dataclass
class AdapterMetrics:
    requests_routed: int = 0
    requests_failed: int = 0
    avg_latency_ms: float = 0.0
    last_activity: float = 0.0


class MESIEFastAPIAdapter:
    def __init__(self, conduit_ref: Optional[Any] = None):
        self._conduit = conduit_ref
        self._route_mappings: List[RouteMapping] = []
        self._metrics = AdapterMetrics()
        self._interceptors: Dict[str, Callable] = {}

    def map_route(self, path: str, method: str, mesie_element: str, channel: str = "visible", passthrough: bool = False) -> None:
        self._route_mappings.append(RouteMapping(path=path, method=method.upper(), mesie_element=mesie_element, spectral_channel=channel, passthrough=passthrough))

    def intercept(self, path_pattern: str) -> Callable:
        def decorator(func: Callable) -> Callable:
            self._interceptors[path_pattern] = func
            return func
        return decorator

    def process_request(self, path: str, method: str, body: Dict[str, Any]) -> Dict[str, Any]:
        start = time.time()
        mapping = self._find_mapping(path, method)
        if not mapping:
            return {"status": "passthrough", "message": "No MESIE mapping for this route"}
        for pattern, interceptor in self._interceptors.items():
            if pattern in path:
                body = interceptor(body)
        if self._conduit:
            msg_id = self._conduit.route_from_fastapi(path, method, body)
            self._metrics.requests_routed += 1
        else:
            msg_id = None
            self._metrics.requests_failed += 1
        latency = (time.time() - start) * 1000
        self._update_metrics(latency)
        return {"status": "routed" if msg_id else "failed", "message_id": msg_id, "mesie_element": mapping.mesie_element, "channel": mapping.spectral_channel, "latency_ms": round(latency, 2), "passthrough": mapping.passthrough}

    def get_metrics(self) -> Dict[str, Any]:
        return {"requests_routed": self._metrics.requests_routed, "requests_failed": self._metrics.requests_failed, "avg_latency_ms": round(self._metrics.avg_latency_ms, 2), "last_activity": self._metrics.last_activity, "route_count": len(self._route_mappings), "interceptor_count": len(self._interceptors)}

    def _find_mapping(self, path: str, method: str) -> Optional[RouteMapping]:
        for mapping in self._route_mappings:
            if mapping.method == method.upper() and self._path_matches(mapping.path, path):
                return mapping
        return None

    def _path_matches(self, pattern: str, path: str) -> bool:
        if pattern.endswith("*"):
            return path.startswith(pattern[:-1])
        return pattern == path

    def _update_metrics(self, latency_ms: float) -> None:
        total = self._metrics.requests_routed + self._metrics.requests_failed
        if total > 0:
            self._metrics.avg_latency_ms = (self._metrics.avg_latency_ms * (total - 1) + latency_ms) / total
        self._metrics.last_activity = time.time()
