"""Performance Monitoring: Real-time metrics, latency tracking, resource utilization.

Tracks system performance across:
- Request latency (p50, p95, p99)
- Throughput (requests/second)
- Resource utilization (CPU, memory, GPU)
- Cache hit rates
- Distribution performance
"""
from __future__ import annotations

import logging
import os
import psutil
import time
from collections import deque
from datetime import datetime
from typing import TypedDict

logger = logging.getLogger("performance")

ENABLE_GPU = os.environ.get("ENABLE_GPU", "false").lower() == "true"


class PerformanceStats(TypedDict):
    """Performance statistics."""
    timestamp: str
    request_count: int
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    throughput_rps: float
    cpu_percent: float
    memory_mb: float
    gpu_utilization_percent: float
    cache_hit_rate: float


class PerformanceMonitor:
    """Real-time performance monitoring."""

    def __init__(self, window_size: int = 1000):
        self.window_size = window_size
        self.latencies = deque(maxlen=window_size)
        self.request_count = 0
        self.start_time = time.time()
        self.cache_hits = 0
        self.cache_misses = 0

    def record_request(self, latency_ms: float) -> None:
        """Record a request latency."""
        self.latencies.append(latency_ms)
        self.request_count += 1

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self.cache_misses += 1

    def get_stats(self) -> PerformanceStats:
        """Get current performance statistics."""
        latencies = sorted(list(self.latencies))
        elapsed_seconds = time.time() - self.start_time

        if latencies:
            avg = sum(latencies) / len(latencies)
            p50 = latencies[len(latencies) // 2]
            p95 = latencies[int(len(latencies) * 0.95)]
            p99 = latencies[int(len(latencies) * 0.99)]
        else:
            avg = p50 = p95 = p99 = 0

        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        memory_mb = memory.used / (1024 * 1024)

        gpu_utilization = self._get_gpu_utilization() if ENABLE_GPU else 0
        cache_hit_rate = (
            self.cache_hits / (self.cache_hits + self.cache_misses)
            if (self.cache_hits + self.cache_misses) > 0
            else 0
        )
        throughput = self.request_count / max(elapsed_seconds, 1)

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "request_count": self.request_count,
            "avg_latency_ms": avg,
            "p50_latency_ms": p50,
            "p95_latency_ms": p95,
            "p99_latency_ms": p99,
            "throughput_rps": throughput,
            "cpu_percent": cpu_percent,
            "memory_mb": memory_mb,
            "gpu_utilization_percent": gpu_utilization,
            "cache_hit_rate": cache_hit_rate,
        }

    @staticmethod
    def _get_gpu_utilization() -> float:
        """Get GPU utilization percentage."""
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            return util.gpu
        except Exception:
            return 0


# Global instance
_monitor = None


def get_monitor() -> PerformanceMonitor:
    """Get or create the global performance monitor."""
    global _monitor
    if _monitor is None:
        _monitor = PerformanceMonitor()
    return _monitor


def log_performance() -> None:
    """Log current performance statistics."""
    monitor = get_monitor()
    stats = monitor.get_stats()

    logger.info(
        "performance: %d requests, %.2f RPS, p95=%.2f ms, "
        "cpu=%.1f%%, mem=%.0f MB, gpu=%.1f%%, cache=%.1f%%",
        stats["request_count"],
        stats["throughput_rps"],
        stats["p95_latency_ms"],
        stats["cpu_percent"],
        stats["memory_mb"],
        stats["gpu_utilization_percent"],
        stats["cache_hit_rate"] * 100,
    )
