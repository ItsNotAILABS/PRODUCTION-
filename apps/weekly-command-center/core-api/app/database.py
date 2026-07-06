"""Engine/session layer. `DATABASE_URL` picks the backend: SQLite (the
zero-config default, good for `run_local.sh`) or Postgres (production —
`postgresql+psycopg2://user:pass@host/db`). Every model and query in this app
goes through SQLAlchemy's Core/ORM so the same code runs unmodified on
either engine; nothing here hand-writes dialect-specific SQL.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_SQLITE_URL = f"sqlite:///{DATA_DIR / 'command_center.db'}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_SQLITE_URL)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    from . import db_models  # noqa: F401  (register models on Base.metadata)
    Base.metadata.create_all(bind=engine)
    from .billing import ensure_default_plans
    with SessionLocal() as session:
        ensure_default_plans(session)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def session_scope() -> Session:
    """For callers outside FastAPI's request/dependency cycle (agents, CLI)."""
    return SessionLocal()
