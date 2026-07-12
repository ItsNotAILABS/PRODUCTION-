"""Health check and service status monitoring.

Tracks the health of all computation engines and workers:
- Julia optimizer (sidecar microservice)
- Haskell parser (sidecar microservice)
- Python transformers (fallback implementations)
- Inner agent worker (scheduler process)
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import TypedDict

logger = logging.getLogger("health")

OPTIMIZER_URL = os.environ.get("OPTIMIZER_URL", "http://127.0.0.1:8100")
TASKRULES_URL = os.environ.get("TASKRULES_URL", "http://127.0.0.1:8200")
HEALTH_CHECK_TIMEOUT = 1.0


class ServiceStatus(TypedDict):
    """Status of a single service."""
    name: str
    healthy: bool
    last_checked: str
    error: str | None
    engine: str  # "native" (Julia/Haskell) or "python-fallback"


class SystemHealth(TypedDict):
    """Overall system health."""
    status: str  # "healthy", "degraded", "critical"
    timestamp: str
    services: dict[str, ServiceStatus]
    message: str


_last_check: dict[str, ServiceStatus] = {}
_last_check_time: datetime | None = None
_check_cache_seconds = 5


def _check_service(name: str, url: str) -> ServiceStatus:
    """Check if a service is reachable and responsive."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Weekly-Command-Center/1.0"},
            method="HEAD",
        )
        with urllib.request.urlopen(req, timeout=HEALTH_CHECK_TIMEOUT) as resp:
            return {
                "name": name,
                "healthy": 200 <= resp.status < 300,
                "last_checked": datetime.utcnow().isoformat(),
                "error": None,
                "engine": "native",
            }
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {
            "name": name,
            "healthy": False,
            "last_checked": datetime.utcnow().isoformat(),
            "error": str(e),
            "engine": "python-fallback",
        }


def get_health() -> SystemHealth:
    """Get current system health status.

    Caches results for 5 seconds to avoid hammering services with health checks.
    Falls back to cached results if all checks fail (prevents cascading failures).
    """
    global _last_check, _last_check_time

    now = datetime.utcnow()
    if _last_check_time and (now - _last_check_time) < timedelta(seconds=_check_cache_seconds):
        return _build_response(_last_check)

    # Check each service
    statuses = {
        "optimizer": _check_service("Julia Optimizer", f"{OPTIMIZER_URL}/"),
        "parser": _check_service("Haskell Parser", f"{TASKRULES_URL}/"),
    }

    # Use cached results if all checks failed (network issue)
    if not any(s.get("healthy") for s in statuses.values()) and _last_check:
        logger.warning("All service checks failed; using cached status")
        return _build_response(_last_check)

    _last_check = statuses
    _last_check_time = now
    return _build_response(statuses)


def _build_response(statuses: dict[str, ServiceStatus]) -> SystemHealth:
    """Build a system health response from service statuses."""
    healthy_count = sum(1 for s in statuses.values() if s["healthy"])
    total_count = len(statuses)

    if healthy_count == total_count:
        status = "healthy"
        message = "All computation engines running natively"
    elif healthy_count > 0:
        status = "degraded"
        message = f"{total_count - healthy_count} service(s) unavailable; using Python fallbacks"
    else:
        status = "critical"
        message = "All native services offline; system running on Python fallbacks only"

    return {
        "status": status,
        "timestamp": datetime.utcnow().isoformat(),
        "services": statuses,
        "message": message,
    }


def log_health() -> None:
    """Log current system health (for monitoring/debugging)."""
    health = get_health()
    logger.info("System health: %s — %s", health["status"].upper(), health["message"])
    for service_name, status in health["services"].items():
        engine = status["engine"]
        if status["healthy"]:
            logger.info("  ✓ %s: %s (native)", service_name, status["name"])
        else:
            logger.warning("  ✗ %s: %s (python-fallback) — %s", service_name, status["name"], status["error"])
