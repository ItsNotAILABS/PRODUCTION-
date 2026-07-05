"""Standalone entrypoint for the inner agent in production, where the web
process (core-api) runs as multiple gunicorn workers — running the scheduler
inside each of them would fire every housekeeping job N times. This process
runs it exactly once. See docker-compose.prod.yml (`core-worker` service).
"""
import logging
import signal
import time

from app.agents import inner_agent
from app.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

_running = True


def _handle_shutdown(signum, frame):
    global _running
    _running = False


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    init_db()
    inner_agent.start()
    logging.getLogger("worker").info("inner agent worker started")

    while _running:
        time.sleep(1)

    inner_agent.stop()
