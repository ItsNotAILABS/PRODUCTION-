"""Standalone entrypoint for the inner agent in production, where the web
process (core-api) runs as multiple gunicorn workers — running the scheduler
inside each of them would fire every housekeeping job N times. This process
runs it exactly once. See docker-compose.prod.yml (`core-worker` service).

This worker ensures housekeeping jobs run at a fixed cadence:
- Recompute deadline pressure across all accounts (every 10 min)
- Check for Monday rollover and week continuity (every 10 min, idempotent)
- Rescan library registry for dependency metadata (every 1 hour)
"""
import logging
import signal
import time

from app import health
from app.agents import inner_agent
from app.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")

_running = True


def _handle_shutdown(signum, frame):
    global _running
    _running = False
    logger.info("shutdown signal received, stopping gracefully")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    logger.info("worker process starting")
    init_db()
    logger.info("database initialized with Alembic migrations")

    inner_agent.start()
    logger.info("inner agent scheduler started")
    health.log_health()

    logger.info("worker ready to serve housekeeping jobs")
    while _running:
        time.sleep(1)

    logger.info("stopping inner agent scheduler")
    inner_agent.stop()
    logger.info("worker process exited cleanly")
