import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app import db


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Point the sqlite layer at a fresh temp file per test so tests never
    share state with each other or with a developer's local data/ directory.
    """
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    if hasattr(db._local, "conn"):
        db._local.conn.close()
        del db._local.conn
    db.init_db()
    yield
    if hasattr(db._local, "conn"):
        db._local.conn.close()
        del db._local.conn
