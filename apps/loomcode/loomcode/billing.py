"""API keys, plans, and usage metering.

Metering is the part that turns a library into a business, and it is worth being
precise about *what* gets metered. Billing per request punishes the customer for
the tool working well — the whole value proposition is fewer, smaller calls. So
the meter here counts two things separately:

  * **indexed lines** — the size of the estate under management, which is what a
    seat/tier should actually be priced on
  * **context bytes saved** — card bytes versus full-file bytes on every read,
    which is the customer-visible value delivered

Charging on estate size and reporting on bytes saved keeps the incentive
straight: we get paid for coverage, they get paid back in context. A request
counter exists for abuse control, not for the invoice.

Keys are stored as salted SHA-256 hashes. The plaintext key is shown exactly
once, at creation, and is unrecoverable afterwards — the same discipline any
security review will ask for, and cheaper to build now than to retrofit.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
import time
from dataclasses import dataclass

# --- plans -------------------------------------------------------------------


@dataclass(frozen=True)
class Plan:
    slug: str
    name: str
    max_indexed_lines: int
    max_repos: int
    monthly_price_usd: int
    rate_limit_per_min: int
    support: str
    self_hosted: bool = False

    def as_dict(self) -> dict:
        return {"slug": self.slug, "name": self.name,
                "max_indexed_lines": self.max_indexed_lines,
                "max_repos": self.max_repos,
                "monthly_price_usd": self.monthly_price_usd,
                "rate_limit_per_min": self.rate_limit_per_min,
                "support": self.support, "self_hosted": self.self_hosted}


PLANS: dict[str, Plan] = {
    "free": Plan("free", "Free", 25_000, 1, 0, 60,
                 "community", False),
    "team": Plan("team", "Team", 1_000_000, 10, 99, 600,
                 "email, 2 business days", False),
    "business": Plan("business", "Business", 10_000_000, 100, 499, 3_000,
                     "email + shared Slack, 1 business day", False),
    # The one enterprises actually buy: runs inside their perimeter, so source
    # never crosses a boundary. Priced as a licence, not per call.
    "enterprise": Plan("enterprise", "Enterprise (self-hosted)", 1_000_000_000, 10_000,
                       2_500, 100_000, "named contact, 4h response", True),
}

DEFAULT_PLAN = "free"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, email TEXT, plan TEXT, created_at REAL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY, account_id TEXT, prefix TEXT, label TEXT,
  created_at REAL, last_used_at REAL, revoked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, ts REAL, endpoint TEXT,
  indexed_lines INTEGER DEFAULT 0, context_bytes_served INTEGER DEFAULT 0,
  context_bytes_full INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_usage_acct ON usage(account_id, ts);
CREATE TABLE IF NOT EXISTS rate (
  account_id TEXT, minute INTEGER, count INTEGER, PRIMARY KEY (account_id, minute));
"""

_SALT = os.environ.get("LOOM_KEY_SALT", "loomcode-dev-salt-change-me")


def hash_key(key: str) -> str:
    return hashlib.sha256((_SALT + key).encode()).hexdigest()


class Billing:
    def __init__(self, db_path: str = "loomcode.db"):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    # -- accounts and keys ----------------------------------------------------
    def create_account(self, email: str, plan: str = DEFAULT_PLAN) -> dict:
        if plan not in PLANS:
            raise ValueError(f"unknown plan {plan!r}; valid: {sorted(PLANS)}")
        account_id = "acct_" + secrets.token_hex(8)
        self.conn.execute(
            "INSERT INTO accounts (id, email, plan, created_at) VALUES (?,?,?,?)",
            (account_id, email, plan, time.time()))
        self.conn.commit()
        return {"account_id": account_id, "email": email, "plan": plan}

    def issue_key(self, account_id: str, label: str = "default") -> dict:
        """Mint a key. The plaintext is returned once and never stored."""
        if self.conn.execute("SELECT 1 FROM accounts WHERE id=?", (account_id,)).fetchone() is None:
            raise KeyError(f"no such account: {account_id}")
        raw = "lc_" + secrets.token_urlsafe(32)
        self.conn.execute(
            "INSERT INTO api_keys (key_hash, account_id, prefix, label, created_at) "
            "VALUES (?,?,?,?,?)",
            (hash_key(raw), account_id, raw[:11], label, time.time()))
        self.conn.commit()
        return {"api_key": raw, "prefix": raw[:11], "label": label,
                "warning": "store this now — it is hashed at rest and cannot be shown again"}

    def revoke_key(self, prefix: str) -> bool:
        cur = self.conn.execute("UPDATE api_keys SET revoked=1 WHERE prefix=?", (prefix,))
        self.conn.commit()
        return cur.rowcount > 0

    def authenticate(self, key: str) -> dict | None:
        row = self.conn.execute(
            "SELECT k.account_id, k.revoked, a.plan, a.active, a.email "
            "FROM api_keys k JOIN accounts a ON a.id = k.account_id "
            "WHERE k.key_hash=?", (hash_key(key),)).fetchone()
        if row is None or row["revoked"] or not row["active"]:
            return None
        self.conn.execute("UPDATE api_keys SET last_used_at=? WHERE key_hash=?",
                          (time.time(), hash_key(key)))
        self.conn.commit()
        return {"account_id": row["account_id"], "plan": row["plan"], "email": row["email"]}

    # -- limits ---------------------------------------------------------------
    def check_rate(self, account_id: str, plan: str) -> tuple[bool, int]:
        """Fixed-window per-minute counter. Coarse on window boundaries, which is
        acceptable for abuse control and avoids a dependency on Redis."""
        minute = int(time.time() // 60)
        row = self.conn.execute(
            "SELECT count FROM rate WHERE account_id=? AND minute=?",
            (account_id, minute)).fetchone()
        used = row["count"] if row else 0
        limit = PLANS[plan].rate_limit_per_min
        if used >= limit:
            return False, 0
        self.conn.execute(
            "INSERT INTO rate (account_id, minute, count) VALUES (?,?,1) "
            "ON CONFLICT(account_id, minute) DO UPDATE SET count = count + 1",
            (account_id, minute))
        self.conn.execute("DELETE FROM rate WHERE minute < ?", (minute - 5,))
        self.conn.commit()
        return True, limit - used - 1

    def indexed_lines(self, account_id: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(SUM(indexed_lines),0) n FROM usage WHERE account_id=?",
            (account_id,)).fetchone()
        return int(row["n"])

    def check_quota(self, account_id: str, plan: str, adding_lines: int = 0) -> tuple[bool, str]:
        cap = PLANS[plan].max_indexed_lines
        current = self.indexed_lines(account_id)
        if current + adding_lines > cap:
            return False, (f"plan '{plan}' allows {cap:,} indexed lines; this request would "
                           f"reach {current + adding_lines:,}. Upgrade or drop unused repos.")
        return True, ""

    # -- metering -------------------------------------------------------------
    def record(self, account_id: str, endpoint: str, indexed_lines: int = 0,
               bytes_served: int = 0, bytes_full: int = 0) -> None:
        self.conn.execute(
            "INSERT INTO usage (account_id, ts, endpoint, indexed_lines, "
            "context_bytes_served, context_bytes_full) VALUES (?,?,?,?,?,?)",
            (account_id, time.time(), endpoint, indexed_lines, bytes_served, bytes_full))
        self.conn.commit()

    def usage_summary(self, account_id: str, days: int = 30) -> dict:
        since = time.time() - days * 86400
        # `full` is a SQLite reserved word (FULL OUTER JOIN) and cannot be used
        # bare as a column alias — it parses as a join keyword and fails.
        row = self.conn.execute(
            "SELECT COUNT(*) calls, COALESCE(SUM(indexed_lines),0) lines, "
            "COALESCE(SUM(context_bytes_served),0) served, "
            "COALESCE(SUM(context_bytes_full),0) full_bytes "
            "FROM usage WHERE account_id=? AND ts>=?", (account_id, since)).fetchone()
        acct = self.conn.execute(
            "SELECT plan FROM accounts WHERE id=?", (account_id,)).fetchone()
        plan = PLANS[acct["plan"]] if acct else PLANS[DEFAULT_PLAN]
        served, full = int(row["served"]), int(row["full_bytes"])
        saved = max(full - served, 0)
        by_ep = self.conn.execute(
            "SELECT endpoint, COUNT(*) n FROM usage WHERE account_id=? AND ts>=? "
            "GROUP BY endpoint ORDER BY n DESC", (account_id, since)).fetchall()
        return {
            "account_id": account_id, "plan": plan.slug, "window_days": days,
            "calls": row["calls"],
            "indexed_lines_total": self.indexed_lines(account_id),
            "indexed_lines_cap": plan.max_indexed_lines,
            "context_bytes_served": served,
            "context_bytes_if_full_reads": full,
            "context_bytes_saved": saved,
            "reduction_factor": round(full / served, 2) if served else None,
            "by_endpoint": {r["endpoint"]: r["n"] for r in by_ep},
            "note": "billing is on indexed lines; bytes saved is the value delivered, not a charge",
        }
