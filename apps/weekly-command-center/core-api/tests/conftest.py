import os

# Must happen before `app.main` is ever imported: disable the in-process
# scheduler for the whole test session so tests never leave a background
# APScheduler thread holding a stale (monkeypatched, since-reverted) DB
# session — see the fixtures below for why that matters.
os.environ.setdefault("ENABLE_INNER_AGENT", "false")
os.environ.setdefault("JWT_SECRET", "test-only-secret")
os.environ.setdefault("CORS_ORIGINS", "*")

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import database


@pytest.fixture()
def db_session(monkeypatch):
    """Fresh in-memory SQLite per test, swapped in for the real engine/
    session factory so tests never touch a developer's local data/ directory
    and never leak state between tests."""
    test_engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    test_session_local = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, future=True)
    monkeypatch.setattr(database, "engine", test_engine)
    monkeypatch.setattr(database, "SessionLocal", test_session_local)
    database.init_db()
    yield test_session_local


@pytest.fixture()
def client(db_session):
    from app.main import app

    with TestClient(app) as c:
        yield c


def signup(client, account_name: str, email: str, password: str = "testpassword1") -> dict:
    resp = client.post(
        "/auth/signup",
        json={"account_name": account_name, "email": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
