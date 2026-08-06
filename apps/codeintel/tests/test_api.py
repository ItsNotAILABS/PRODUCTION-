"""Tests for the Code Intelligence API.

Weighted toward the things a customer or a security reviewer will actually
probe: does one tenant's data leak into another, does the quota hold, does an
ambiguous symbol get guessed at, is a revoked key really dead. Correctness of
the index is table stakes; those properties are what make it sellable.
"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient

os.environ["CODEINTEL_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from codeintel.api import app, billing, index  # noqa: E402
from codeintel.billing import PLANS, hash_key  # noqa: E402
from codeintel.index import profile_text, read_lines, tokens  # noqa: E402

client = TestClient(app)

SAMPLE = '''"""Pricing helpers."""
import math

TAX_RATE = 0.2


# --- markup ------------------------------------------------------------------

def markup_price(cost, elasticity):
    """Optimal price from the Lerner rule."""
    if elasticity >= -1.0:
        raise ValueError("inelastic")
    return cost * elasticity / (elasticity + 1)


class Catalog:
    """A set of priced items."""

    def total(self, items):
        """Sum item prices with tax."""
        out = 0
        for i in items:
            out += i
        return out * (1 + TAX_RATE)
'''


def mkacct(plan="team"):
    a = billing.create_account(f"{plan}@example.com", plan=plan)
    k = billing.issue_key(a["account_id"])["api_key"]
    return a["account_id"], {"Authorization": f"Bearer {k}"}


@pytest.fixture
def team():
    acct, h = mkacct("team")
    client.post("/v1/repos/r/files", headers=h,
                json={"files": [{"path": "pricing.py", "content": SAMPLE}]})
    return acct, h


# --- indexing -----------------------------------------------------------------

def test_index_reports_symbols_and_compression(team):
    _, h = team
    r = client.post("/v1/repos/r2/files", headers=h,
                    json={"files": [{"path": "pricing.py", "content": SAMPLE}]})
    assert r.status_code == 200
    body = r.json()
    assert body["indexed"] == 1
    assert body["results"][0]["symbols"] >= 4
    assert 0 < body["results"][0]["compression"] < 1


def test_resubmitting_unchanged_content_is_a_no_op(team):
    _, h = team
    r = client.post("/v1/repos/r/files", headers=h,
                    json={"files": [{"path": "pricing.py", "content": SAMPLE}]})
    assert r.json()["unchanged"] == 1 and r.json()["indexed"] == 0


def test_changed_content_reindexes(team):
    _, h = team
    changed = SAMPLE + "\n\ndef discount(x):\n    return x * 0.9\n"
    r = client.post("/v1/repos/r/files", headers=h,
                    json={"files": [{"path": "pricing.py", "content": changed}]})
    assert r.json()["indexed"] == 1
    assert client.get("/v1/repos/r/locate", headers=h,
                      params={"name": "discount"}).json()["count"] == 1


def test_api_states_content_is_not_retained(team):
    """The privacy claim is load-bearing for enterprise sales, so it is asserted
    in the response and pinned here."""
    _, h = team
    r = client.post("/v1/repos/r3/files", headers=h,
                    json={"files": [{"path": "p.py", "content": SAMPLE}]})
    assert r.json()["content_retained"] is False


def test_empty_submission_is_rejected(team):
    _, h = team
    assert client.post("/v1/repos/r/files", headers=h, json={"files": []}).status_code == 400


# --- navigation ---------------------------------------------------------------

def test_card_is_much_smaller_than_the_file(team):
    _, h = team
    r = client.get("/v1/repos/r/card", headers=h, params={"path": "pricing.py"}).json()
    assert r["context"]["reduction_factor"] > 1.5
    assert any(s["name"] == "markup_price" for s in r["symbols"])
    assert "markup_price" in r["rendered"]


def test_card_line_spans_point_at_the_symbol(team):
    _, h = team
    card = client.get("/v1/repos/r/card", headers=h, params={"path": "pricing.py"}).json()
    sym = next(s for s in card["symbols"] if s["name"] == "markup_price")
    lines = SAMPLE.splitlines()
    assert "def markup_price" in lines[sym["line_start"] - 1]


def test_search_finds_a_symbol_by_its_words(team):
    _, h = team
    names = [x["name"] for x in client.get(
        "/v1/repos/r/search", headers=h, params={"q": "optimal price lerner"}).json()["results"]]
    assert "markup_price" in names


def test_search_requires_a_real_query(team):
    _, h = team
    assert client.get("/v1/repos/r/search", headers=h, params={"q": "a"}).status_code == 422


def test_missing_card_is_404(team):
    _, h = team
    assert client.get("/v1/repos/r/card", headers=h,
                      params={"path": "nope.py"}).status_code == 404


# --- reading ------------------------------------------------------------------

def test_read_symbol_returns_only_that_symbol(team):
    _, h = team
    r = client.post("/v1/repos/r/read_symbol", headers=h,
                    json={"name": "markup_price", "content": SAMPLE}).json()
    assert "def markup_price" in r["text"]
    assert "class Catalog" not in r["text"]
    assert r["context"]["reduction_factor"] > 1


def test_ambiguous_symbol_returns_409_with_candidates():
    """Two files, same symbol name: the API must refuse to choose."""
    _, h = mkacct("team")
    a = "def shared():\n    return 1\n"
    b = "def shared():\n    return 2\n"
    client.post("/v1/repos/amb/files", headers=h, json={"files": [
        {"path": "a.py", "content": a}, {"path": "b.py", "content": b}]})
    r = client.post("/v1/repos/amb/read_symbol", headers=h,
                    json={"name": "shared", "content": a})
    assert r.status_code == 409
    assert len(r.json()["candidates"]) == 2
    # disambiguating resolves it
    ok = client.post("/v1/repos/amb/read_symbol", headers=h,
                     json={"name": "shared", "content": a, "path": "a.py"})
    assert ok.status_code == 200 and "return 1" in ok.json()["text"]


def test_unknown_symbol_is_404(team):
    _, h = team
    assert client.post("/v1/repos/r/read_symbol", headers=h,
                       json={"name": "nope", "content": SAMPLE}).status_code == 404


def test_out_of_range_read_clamps_and_flags(team):
    _, h = team
    r = client.post("/v1/repos/r/read", headers=h, json={
        "path": "pricing.py", "content": SAMPLE, "start": 5, "end": 99999}).json()
    assert r["clamped"] is True
    assert r["end"] == len(SAMPLE.splitlines())


def test_reversed_range_is_rejected(team):
    _, h = team
    assert client.post("/v1/repos/r/read", headers=h, json={
        "path": "p.py", "content": SAMPLE, "start": 20, "end": 5}).status_code == 400


# --- auth ---------------------------------------------------------------------

def test_no_auth_is_401():
    assert client.get("/v1/repos/r/stats").status_code == 401


def test_bad_key_is_401():
    assert client.get("/v1/repos/r/stats",
                      headers={"Authorization": "Bearer ci_nope"}).status_code == 401


@pytest.mark.parametrize("header", [
    "Bearer ",           # empty token — used to raise IndexError and 500
    "Bearer",            # scheme only
    "",                  # blank
    "ci_key_no_scheme",  # missing scheme
    "Basic abc123",      # wrong scheme
    "Bearer a b c",      # too many parts
])
def test_malformed_auth_headers_401_and_never_500(header):
    """Auth must fail closed on garbage input.

    `Authorization: Bearer ` (empty token) passed a naive startswith check and
    then blew up on the split, returning 500. A live HTTP smoke test caught it;
    the in-process client never sent that shape.
    """
    r = client.get("/v1/repos/r/stats", headers={"Authorization": header})
    assert r.status_code == 401, f"{header!r} produced {r.status_code}"


def test_revoked_key_stops_working():
    acct = billing.create_account("rev@example.com", plan="team")
    issued = billing.issue_key(acct["account_id"])
    h = {"Authorization": f"Bearer {issued['api_key']}"}
    assert client.get("/v1/account", headers=h).status_code == 200
    assert billing.revoke_key(issued["prefix"]) is True
    assert client.get("/v1/account", headers=h).status_code == 401


def test_keys_are_stored_hashed_never_plaintext():
    """A security review will check this specifically."""
    acct = billing.create_account("sec@example.com")
    raw = billing.issue_key(acct["account_id"])["api_key"]
    rows = billing.conn.execute("SELECT key_hash, prefix FROM api_keys").fetchall()
    stored = {r["key_hash"] for r in rows}
    assert raw not in stored
    assert hash_key(raw) in stored
    # the prefix is a lookup aid only and is not enough to authenticate
    assert client.get("/v1/account",
                      headers={"Authorization": f"Bearer {raw[:11]}"}).status_code == 401


# --- tenancy and limits -------------------------------------------------------

def test_tenants_cannot_see_each_others_repos():
    """The isolation test. Two accounts, same repo name, no bleed."""
    _, h1 = mkacct("team")
    _, h2 = mkacct("team")
    client.post("/v1/repos/shared-name/files", headers=h1,
                json={"files": [{"path": "secret.py", "content": SAMPLE}]})
    assert client.get("/v1/repos", headers=h1).json()["repos"] == ["shared-name"]
    assert client.get("/v1/repos", headers=h2).json()["repos"] == []
    assert client.get("/v1/repos/shared-name/stats", headers=h2).json()["files"] == 0
    assert client.get("/v1/repos/shared-name/search", headers=h2,
                      params={"q": "markup price"}).json()["count"] == 0
    assert client.get("/v1/repos/shared-name/card", headers=h2,
                      params={"path": "secret.py"}).status_code == 404


def test_quota_refuses_oversized_index_with_402():
    _, h = mkacct("free")
    cap = PLANS["free"].max_indexed_lines
    big = [{"path": f"b{i}.py", "content": "x = 1\n" * (cap // 2)} for i in range(3)]
    r = client.post("/v1/repos/big/files", headers=h, json={"files": big})
    assert r.status_code == 402
    assert "indexed lines" in r.json()["detail"]


def test_usage_reports_the_billing_basis_and_value():
    acct, h = mkacct("team")
    client.post("/v1/repos/u/files", headers=h,
                json={"files": [{"path": "pricing.py", "content": SAMPLE}]})
    client.post("/v1/repos/u/read_symbol", headers=h,
                json={"name": "markup_price", "content": SAMPLE})
    u = client.get("/v1/usage", headers=h).json()
    assert u["indexed_lines_total"] > 0
    assert u["context_bytes_if_full_reads"] > u["context_bytes_served"] > 0
    assert u["context_bytes_saved"] > 0
    assert u["reduction_factor"] > 1
    assert "not a charge" in u["note"]


def test_account_reports_remaining_headroom():
    acct, h = mkacct("team")
    a = client.get("/v1/account", headers=h).json()
    assert a["plan"]["slug"] == "team"
    assert a["indexed_lines_remaining"] == PLANS["team"].max_indexed_lines


# --- public metadata ----------------------------------------------------------

def test_health_and_plans_need_no_auth():
    assert client.get("/health").json()["status"] == "ok"
    slugs = {p["slug"] for p in client.get("/v1/plans").json()["plans"]}
    assert {"free", "team", "business", "enterprise"} <= slugs


def test_enterprise_plan_is_self_hosted():
    """The plan that exists because enterprises will not upload source."""
    ent = next(p for p in client.get("/v1/plans").json()["plans"]
               if p["slug"] == "enterprise")
    assert ent["self_hosted"] is True


def test_openapi_spec_is_served():
    spec = client.get("/openapi.json").json()
    assert spec["info"]["title"] == "Code Intelligence API"
    assert "/v1/repos/{repo}/search" in spec["paths"]


# --- index internals ----------------------------------------------------------

def test_profile_line_spans_are_exact():
    card = profile_text("x.py", SAMPLE)
    lines = SAMPLE.splitlines()
    for s in card.symbols:
        if s.kind in ("function", "method", "class"):
            assert s.name in lines[s.line_start - 1]


def test_profile_detects_sections_and_methods():
    card = profile_text("x.py", SAMPLE)
    assert any("markup" in s["title"].lower() for s in card.sections)
    method = next(s for s in card.symbols if s.name == "total")
    assert method.parent == "Catalog" and method.kind == "method"


def test_syntax_error_degrades_rather_than_raising():
    card = profile_text("bad.py", "def broken(:\n    pass\n")
    assert card.exact is False and card.notes


def test_tokens_split_identifiers_without_shingle_noise():
    t = tokens("markup_price computeBeta")
    assert "markup" in t and "price" in t and "compute" in t and "beta" in t
    # no 4-char shingles: the fragment that used to poison ranking
    assert "arku" not in t


def test_read_lines_rejects_zero_index():
    with pytest.raises(ValueError):
        read_lines(SAMPLE, 0, 5)
