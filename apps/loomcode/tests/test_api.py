"""Tests for the Loom Code API.

Weighted toward the things a customer or a security reviewer will actually
probe: does one tenant's data leak into another, does the quota hold, does an
ambiguous symbol get guessed at, is a revoked key really dead. Correctness of
the index is table stakes; those properties are what make it sellable.
"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient

os.environ["LOOM_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from loomcode.api import app, billing, index  # noqa: E402
from loomcode.billing import PLANS, hash_key  # noqa: E402
from loomcode.index import profile_text, read_lines, tokens  # noqa: E402

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
                      headers={"Authorization": "Bearer lc_nope"}).status_code == 401


@pytest.mark.parametrize("header", [
    "Bearer ",           # empty token — used to raise IndexError and 500
    "Bearer",            # scheme only
    "",                  # blank
    "lc_key_no_scheme",  # missing scheme
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
    assert spec["info"]["title"] == "Loom Code API"
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


# --- browser access -----------------------------------------------------------
#
# A demo page, an editor webview, or a dashboard cannot call this service at all
# without CORS — the browser refuses before the request leaves. The middleware is
# configured at import time from the environment, so these tests rebuild the app
# under a controlled env rather than mutating the already-imported one.

def _app_with_origins(value):
    import importlib
    import loomcode.api as api_mod
    old = os.environ.get("LOOM_CORS_ORIGINS")
    if value is None:
        os.environ.pop("LOOM_CORS_ORIGINS", None)
    else:
        os.environ["LOOM_CORS_ORIGINS"] = value
    try:
        return TestClient(importlib.reload(api_mod).app)
    finally:
        if old is None:
            os.environ.pop("LOOM_CORS_ORIGINS", None)
        else:
            os.environ["LOOM_CORS_ORIGINS"] = old
        importlib.reload(api_mod)


def test_cors_is_off_unless_an_operator_opts_in():
    c = _app_with_origins(None)
    r = c.get("/health", headers={"Origin": "https://evil.example"})
    assert r.status_code == 200
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_configured_origin_is_allowed_and_others_are_not():
    c = _app_with_origins("https://app.example.com,https://demo.example.com")

    allowed = c.options("/v1/repos/r/search", headers={
        "Origin": "https://app.example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization"})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://app.example.com"
    assert "authorization" in allowed.headers["access-control-allow-headers"].lower()

    denied = c.get("/health", headers={"Origin": "https://evil.example"})
    assert denied.headers.get("access-control-allow-origin") != "https://evil.example"


def test_cors_never_allows_credentials():
    # Auth here is a bearer token, not a cookie. Allowing credentials would widen
    # the surface for nothing, and it is what makes a wildcard origin dangerous.
    c = _app_with_origins("https://app.example.com")
    r = c.get("/health", headers={"Origin": "https://app.example.com"})
    assert "access-control-allow-credentials" not in {k.lower() for k in r.headers}


# --- multi-language structure -------------------------------------------------
#
# The previous release parsed everything but Python with a regex and admitted the
# spans were guesses. These assert the guarantee that replaced it: a real parse,
# with end lines you can edit against.

GO_SRC = '''package pricing

import (
	"errors"
	"math"
)

// OptimalPrice applies the Lerner inverse-elasticity rule.
func OptimalPrice(mc float64, e float64) (float64, error) {
	if e >= -1.0 {
		return 0, errors.New("inelastic")
	}
	return mc * e / (e + 1.0), nil
}

type Catalog struct {
	Items []string
}

// Total sums the catalog.
func (c *Catalog) Total(rate float64) float64 {
	return math.Abs(rate) * OptimalPrice(rate, -2)
}
'''

TS_SRC = '''import { z } from "zod";

// Midpoint elasticity between two observed points.
export function arcElasticity(q1: number, q2: number): number {
  return q2 - q1;
}

export class Pricer {
  // Optimal price from elasticity.
  optimal(mc: number, e: number): number {
    return mc * e / (e + 1);
  }
  report() {
    return this.optimal(1, -2) + arcElasticity(1, 2);
  }
}
'''

PAS_SRC = '''unit Pricing;
interface
uses SysUtils;
type
  TCatalog = class(TObject)
    procedure Total(R: Double);
  end;
implementation
function OptimalPrice(MC, E: Double): Double;
begin
  Result := MC * E / (E + 1.0);
end;
procedure TCatalog.Total(R: Double);
begin
  WriteLn(OptimalPrice(R, -2.0));
end;
end.
'''


@pytest.mark.parametrize("path,src,expect", [
    ("pricing.go", GO_SRC, "OptimalPrice"),
    ("pricing.ts", TS_SRC, "arcElasticity"),
    ("pricing.pas", PAS_SRC, "OptimalPrice"),
])
def test_non_python_spans_are_exact_and_named(path, src, expect):
    card = profile_text(path, src)
    assert card.exact is True, card.notes
    names = {s.name for s in card.symbols}
    assert expect in names
    # every reported span must actually contain the name it claims
    lines = src.splitlines()
    sym = next(s for s in card.symbols if s.name == expect)
    body = "\n".join(lines[sym.line_start - 1:sym.line_end])
    assert expect in body
    assert sym.line_end >= sym.line_start


def test_go_method_is_not_filed_under_its_receiver():
    # `func (c *Catalog) Total(...)` — the first identifier in the node is the
    # receiver, so a naive "first identifier" rule indexes this as `c`.
    card = profile_text("pricing.go", GO_SRC)
    assert "Total" in {s.name for s in card.symbols}
    assert "c" not in {s.name for s in card.symbols}


def test_delphi_qualified_implementation_keeps_its_owner():
    card = profile_text("pricing.pas", PAS_SRC)
    total = next(s for s in card.symbols if s.name == "Total")
    assert total.parent == "TCatalog"
    # the interface-section forward declaration must not double the symbol
    assert sum(1 for s in card.symbols if s.name == "Total") == 1


def test_typescript_method_belongs_to_its_class():
    card = profile_text("pricing.ts", TS_SRC)
    optimal = next(s for s in card.symbols if s.name == "optimal")
    assert optimal.parent == "Pricer" and optimal.kind == "method"


def test_unknown_extension_degrades_to_metadata():
    card = profile_text("notes.xyz", "some prose\nmore prose\n")
    assert card.exact is False and card.symbols == [] and card.notes


def test_doc_comments_become_searchable_intent():
    # Languages without docstrings put the same prose in a leading comment.
    # Ignoring it leaves Go and TS symbols with nothing for search to match on.
    card = profile_text("pricing.go", GO_SRC)
    sym = next(s for s in card.symbols if s.name == "OptimalPrice")
    assert "Lerner" in sym.intent


# --- call graph ---------------------------------------------------------------

GRAPH_FILES = {
    "billing/core.py": '"""Billing."""\n'
                       'def validate(rec):\n    """Check a record."""\n    return bool(rec)\n\n'
                       'def charge(amount, rec):\n    """Charge it."""\n'
                       '    if not validate(rec):\n        raise ValueError("bad")\n'
                       '    return amount\n',
    "shipping/rules.py": '"""Shipping."""\n'
                         'def validate(parcel):\n    """Check a parcel."""\n'
                         '    return parcel is not None\n\n'
                         'def quote(parcel):\n    """Quote it."""\n'
                         '    validate(parcel)\n    return compute_rate(parcel)\n',
    "shipping/rates.py": '"""Rates."""\ndef compute_rate(parcel):\n'
                         '    """The one rate function."""\n    return 4.25\n',
    "api/handler.py": '"""HTTP."""\nfrom billing.core import charge\n\n'
                      'def handle(req):\n    """Entry point."""\n'
                      '    validate(req)\n    return charge(10, req)\n',
}


@pytest.fixture
def graphed():
    acct, h = mkacct("business")
    client.post("/v1/repos/g/files", headers=h, json={
        "files": [{"path": p, "content": c} for p, c in GRAPH_FILES.items()]})
    return acct, h


def test_confidence_tiers_reflect_what_was_actually_known(graphed):
    _, h = graphed
    g = client.get("/v1/repos/g/graph", headers=h).json()
    conf = g["by_confidence"]
    # same file, unique name
    assert conf.get("exact", 0) >= 2
    # unique across the repo but not local: quote -> compute_rate
    assert conf.get("likely", 0) >= 1
    # two `validate` definitions: the call from handle cannot be resolved
    assert conf.get("ambiguous", 0) >= 2
    # ValueError is not in the repo
    assert conf.get("external", 0) >= 1


def test_ambiguous_call_records_every_candidate_rather_than_guessing(graphed):
    _, h = graphed
    rel = client.get("/v1/repos/g/relations", headers=h,
                     params={"name": "handle", "path": "api/handler.py"}).json()
    validates = [c for c in rel["callees"] if c["name"] == "validate"]
    assert len(validates) == 2
    assert {v["path"] for v in validates} == {"billing/core.py", "shipping/rules.py"}
    assert all(v["confidence"] == "ambiguous" for v in validates)


def test_cross_file_unique_name_resolves_as_likely(graphed):
    _, h = graphed
    rel = client.get("/v1/repos/g/relations", headers=h,
                     params={"name": "compute_rate"}).json()
    assert rel["callers"] == [{"name": "quote", "path": "shipping/rules.py",
                               "line": 9, "confidence": "likely"}]


def test_external_calls_are_kept_not_dropped(graphed):
    _, h = graphed
    rel = client.get("/v1/repos/g/relations", headers=h, params={"name": "charge"}).json()
    assert any(e["name"] == "ValueError" for e in rel["external"])


def test_relations_on_a_repeated_name_409s_with_candidates(graphed):
    _, h = graphed
    r = client.get("/v1/repos/g/relations", headers=h, params={"name": "validate"})
    assert r.status_code == 409
    assert len(r.json()["candidates"]) == 2


def test_centrality_ranks_the_most_called_symbol_first(graphed):
    _, h = graphed
    rows = client.get("/v1/repos/g/important", headers=h, params={"top_k": 3}).json()["symbols"]
    # billing/core.py:validate is called by charge and (ambiguously) by handle
    assert rows[0]["name"] == "validate" and rows[0]["path"] == "billing/core.py"
    assert rows[0]["centrality"] > rows[-1]["centrality"]


def test_graph_rebuilds_when_a_file_changes(graphed):
    _, h = graphed
    before = client.get("/v1/repos/g/graph", headers=h).json()["edges"]
    client.post("/v1/repos/g/files", headers=h, json={"files": [
        {"path": "shipping/rates.py",
         "content": '"""Rates."""\ndef compute_rate(p):\n    """Rate."""\n    return 4.25\n'
                    'def surcharge(p):\n    """Extra."""\n    return compute_rate(p) * 2\n'}]})
    after = client.get("/v1/repos/g/graph", headers=h).json()["edges"]
    assert after > before


def test_pagerank_is_a_distribution_not_a_count():
    from loomcode.graph import pagerank
    nodes = [("a.py", "x"), ("a.py", "y"), ("b.py", "z")]
    edges = [{"from_path": "a.py", "from": "x", "to_path": "a.py", "to": "y",
              "line": 1, "confidence": "exact"},
             {"from_path": "b.py", "from": "z", "to_path": "a.py", "to": "y",
              "line": 1, "confidence": "exact"}]
    r = pagerank(edges, nodes)
    assert abs(sum(r.values()) - 1.0) < 1e-6      # dangling rank is not leaked
    assert r[("a.py", "y")] == max(r.values())


def test_low_confidence_edges_move_less_rank():
    from loomcode.graph import pagerank
    nodes = [("a.py", "src"), ("a.py", "sure"), ("a.py", "guess")]
    edges = [{"from_path": "a.py", "from": "src", "to_path": "a.py", "to": "sure",
              "line": 1, "confidence": "exact"},
             {"from_path": "a.py", "from": "src", "to_path": "a.py", "to": "guess",
              "line": 2, "confidence": "ambiguous"}]
    r = pagerank(edges, nodes)
    assert r[("a.py", "sure")] > r[("a.py", "guess")]


# --- fusion -------------------------------------------------------------------

def test_rrf_prefers_agreement_across_signals_over_one_confident_pick():
    from loomcode.rank import rrf
    # "b" is second on both rankers; "a" is first on one and absent from the
    # other. Fusion should pick the one both signals agree about.
    fused = rrf({"lexical": (1.0, ["a", "b", "c"]), "name": (1.0, ["d", "b", "e"])})
    assert fused[0][0] == "b"


def test_rrf_reports_which_signals_placed_a_result():
    from loomcode.rank import rrf
    fused = rrf({"lexical": (1.0, ["x"]), "central": (0.35, ["x"])})
    assert fused[0][2] == {"lexical": 1, "central": 1}


def test_zero_weight_ranker_is_ignored():
    from loomcode.rank import rrf
    assert rrf({"off": (0.0, ["a"]), "on": (1.0, ["b"])})[0][0] == "b"


def test_name_match_beats_partial_match():
    from loomcode.rank import name_match_boost
    assert name_match_boost("optimal_price", "optimal price") == 1.0
    assert name_match_boost("optimal_price", "price") < 1.0
    assert name_match_boost("unrelated", "optimal price") == 0.0


def test_search_returns_the_right_symbol_and_shows_its_signals(team):
    _, h = team
    hits = client.get("/v1/repos/r/search", headers=h,
                      params={"q": "optimal price from the lerner rule"}).json()["results"]
    assert hits[0]["name"] == "markup_price"
    assert "lexical" in hits[0]["signals"]


def test_centrality_does_not_hijack_unrelated_queries(graphed):
    # `validate` is the highest-centrality symbol in this repo. A query about
    # rates must not return it just because it is popular.
    _, h = graphed
    hits = client.get("/v1/repos/g/search", headers=h,
                      params={"q": "compute the shipping rate"}).json()["results"]
    assert hits[0]["name"] == "compute_rate"


# --- context packs ------------------------------------------------------------

def test_pack_pulls_in_callers_and_callees_of_the_match(graphed):
    _, h = graphed
    r = client.post("/v1/repos/g/context_pack", headers=h, json={
        "query": "charge the amount after validating",
        "files": [{"path": p, "content": c} for p, c in GRAPH_FILES.items()],
        "budget_tokens": 4000}).json()
    assert r["found"] is True
    assert r["primary"]["name"] == "charge"
    tiers = {e["tier"] for e in r["elements"]}
    assert "primary" in tiers and "callee" in tiers
    # every element cites the lines it came from, so an edit can be written back
    assert all(e["citation"].startswith(e["path"] + ":L") for e in r["elements"])


def test_pack_never_exceeds_its_budget_and_says_what_it_cut(graphed):
    _, h = graphed
    r = client.post("/v1/repos/g/context_pack", headers=h, json={
        "query": "charge the amount after validating",
        "files": [{"path": p, "content": c} for p, c in GRAPH_FILES.items()],
        "budget_tokens": 60}).json()
    assert r["used_tokens"] <= r["budget_tokens"]
    # 60 tokens holds the matched span and nothing else, so the relations that
    # would normally come with it have to be reported as cut.
    assert r["omitted"], "a 60-token budget cannot hold this repo; that must be reported"
    assert all("reason" in o for o in r["omitted"])


def test_pack_is_smaller_than_reading_the_files(graphed):
    _, h = graphed
    r = client.post("/v1/repos/g/context_pack", headers=h, json={
        "query": "charge the amount after validating",
        "files": [{"path": p, "content": c} for p, c in GRAPH_FILES.items()],
        "budget_tokens": 4000}).json()
    assert r["used_tokens"] < r["if_full_read"]["tokens"]
    assert r["reduction_factor"] > 1.0


def test_pack_without_file_content_reports_it_rather_than_inventing_a_span(graphed):
    _, h = graphed
    r = client.post("/v1/repos/g/context_pack", headers=h, json={
        "query": "charge the amount after validating",
        "files": [{"path": "shipping/rates.py", "content": GRAPH_FILES["shipping/rates.py"]}],
        "budget_tokens": 4000}).json()
    cited = {e["path"] for e in r["elements"] if e["tier"] in ("primary", "callee", "caller")}
    assert cited <= {"shipping/rates.py"}


def test_pack_tier_caps_stop_one_tier_eating_the_budget():
    from loomcode.pack import Pack
    pk = Pack(1000)
    pk.add("primary", "a.py", "main", 1, 10, "x" * 2000, "matched")
    assert pk.used <= 1000 or pk.omitted
    pk2 = Pack(1000)
    pk2.add("primary", "a.py", "main", 1, 2, "x" * 40, "matched")
    for i in range(20):
        pk2.add("caller", "b.py", f"c{i}", 1, 5, "y" * 200, "calls it")
    assert pk2._tier_used["caller"] <= int(1000 * 0.25)
    assert pk2.omitted


def test_pack_orders_relations_by_confidence_before_centrality():
    from loomcode.pack import sort_relations
    rows = [{"name": "guess", "path": "a.py", "confidence": "ambiguous"},
            {"name": "sure", "path": "a.py", "confidence": "exact"}]
    central = {("a.py", "guess"): 0.9, ("a.py", "sure"): 0.01}
    assert [r["name"] for r in sort_relations(rows, central)] == ["sure", "guess"]


def test_anchor_ambiguity_is_refused_rather_than_guessed(graphed):
    _, h = graphed
    r = client.post("/v1/repos/g/context_pack", headers=h, json={
        "query": "charge the amount",
        "files": [{"path": p, "content": c} for p, c in GRAPH_FILES.items()],
        "anchor": "validate"})
    assert r.status_code == 409


def test_graph_data_is_scoped_to_the_calling_account(graphed):
    # Tenant isolation has to hold for derived data too, not just the index.
    _, other = mkacct("free")
    client.post("/v1/repos/g/files", headers=other, json={"files": [
        {"path": "solo.py", "content": '"""Solo."""\ndef only(x):\n    """One."""\n    return x\n'}]})
    rows = client.get("/v1/repos/g/important", headers=other).json()["symbols"]
    assert {r["name"] for r in rows} == {"only"}
