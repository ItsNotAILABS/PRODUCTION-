"""Loom Code API — navigate a codebase without loading it.

The loop an agent runs against this service:

    POST /v1/repos/{repo}/files      submit source, get it indexed
    GET  /v1/repos/{repo}/search     find the symbol by words in its name/doc
    GET  /v1/repos/{repo}/card       the shape of one file (~12% of its bytes)
    POST /v1/repos/{repo}/read       exactly the lines that matter

Every response that returns context also reports what a full-file read would
have cost, so the saving is visible per call rather than asserted in a pitch.

Content handling, stated plainly because buyers will ask: file text submitted to
``/files`` is parsed and **discarded**. Only the derived index is stored — symbol
names, line spans, docstring first lines, and a content hash for change
detection. ``/read`` therefore requires the caller to supply the text it wants
sliced; the service never becomes a copy of the customer's repository. For
customers who cannot send source at all, the same application runs inside their
perimeter on the enterprise plan.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Path as PathParam, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from loomcode.billing import PLANS, Billing
from loomcode.index import CodeIndex, profile_text, read_lines

DB = os.environ.get("LOOM_DB", "loomcode.db")
index = CodeIndex(DB)
billing = Billing(DB)

app = FastAPI(
    title="Loom Code API",
    version="1.0.0",
    description=(
        "Hierarchical codebase navigation for AI agents and developer tools. "
        "Index a repository, then locate and read only the lines that matter — "
        "typically an order of magnitude less context per edit than reading files "
        "whole. No model inference, so latency and cost are CPU-bound.\n\n"
        "Submitted file text is parsed and discarded; only the derived index is "
        "retained. Enterprise deployments run entirely inside your own perimeter."
    ),
)

# Without CORS no browser-based client can call this at all — an editor
# extension, a web IDE, or a dashboard would be blocked before the request is
# sent. Origins are configurable and default to none, so a self-hosted operator
# opts in to exactly the front-ends they run rather than inheriting a wildcard.
# Credentials are not allowed: this API authenticates with a bearer token, not
# cookies, so there is no reason to widen the surface.
_origins = [o.strip() for o in os.environ.get("LOOM_CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


# --- models -------------------------------------------------------------------

class FileIn(BaseModel):
    path: str = Field(..., description="Repo-relative path, e.g. src/pricing.py")
    content: str = Field(..., description="Full file text. Parsed, then discarded.")


class IndexRequest(BaseModel):
    files: list[FileIn] = Field(..., description="Files to index (batch supported)")
    force: bool = Field(False, description="Reindex even if content is unchanged")


class ReadRequest(BaseModel):
    path: str
    content: str = Field(..., description="Current file text to slice")
    start: int = Field(..., ge=1)
    end: int = Field(..., ge=1)
    pad: int = Field(0, ge=0, le=50, description="Extra context lines each side")


class ContextPackRequest(BaseModel):
    query: str = Field(..., min_length=2, description="What you are trying to change")
    files: list[FileIn] = Field(
        ..., description="Current text of the files you want sliced. The service stores "
                         "no source, so spans are cut from what you send.")
    budget_tokens: int = Field(4000, ge=50, le=200_000,
                               description="Hard ceiling on the assembled pack. The floor "
                                           "is low on purpose: a caller squeezing a pack "
                                           "into what is left of a window deserves an "
                                           "answer and an omission list, not a 422.")
    anchor: str | None = Field(None, description="Symbol you are already working near")
    anchor_path: str | None = Field(None, description="Disambiguates the anchor")


class SymbolReadRequest(BaseModel):
    name: str = Field(..., description="Symbol to locate and read")
    content: str = Field(..., description="Text of the file containing it")
    path: str | None = Field(None, description="Disambiguate when the name repeats")
    pad: int = Field(2, ge=0, le=50)


# --- auth ---------------------------------------------------------------------

async def caller(authorization: str = Header(None, description="Bearer <api key>")) -> dict:
    # Parse defensively. `Authorization: Bearer ` with an empty token passes a
    # naive startswith("bearer ") check and then raises IndexError on the split,
    # turning a malformed request into a 500. Auth must fail closed with a 401,
    # never crash — found by a live HTTP smoke test that the in-process test
    # client had not exercised.
    parts = (authorization or "").split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(401, "missing or malformed bearer token — send "
                                 "'Authorization: Bearer lc_...'")
    ident = billing.authenticate(parts[1].strip())
    if ident is None:
        raise HTTPException(401, "invalid, revoked, or inactive API key")
    ok, remaining = billing.check_rate(ident["account_id"], ident["plan"])
    if not ok:
        raise HTTPException(
            429, f"rate limit reached for plan '{ident['plan']}' "
                 f"({PLANS[ident['plan']].rate_limit_per_min}/min)")
    ident["rate_remaining"] = remaining
    return ident


# --- meta ---------------------------------------------------------------------

@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "loomcode", "version": app.version}


@app.get("/v1/plans", tags=["meta"])
def plans() -> dict:
    return {"plans": [p.as_dict() for p in PLANS.values()],
            "billing_basis": "indexed lines under management",
            "note": "requests are rate-limited for abuse control, not billed per call"}


# --- indexing -----------------------------------------------------------------

@app.post("/v1/repos/{repo}/files", tags=["index"])
def index_files(payload: IndexRequest,
                repo: str = PathParam(..., description="Repository identifier"),
                who: dict = Depends(caller)) -> dict:
    if not payload.files:
        raise HTTPException(400, "no files supplied")

    incoming = sum(f.content.count("\n") + 1 for f in payload.files)
    ok, why = billing.check_quota(who["account_id"], who["plan"], incoming)
    if not ok:
        raise HTTPException(402, why)

    scoped = f"{who['account_id']}/{repo}"
    results, newly_indexed = [], 0
    for f in payload.files:
        r = index.put_file(scoped, f.path, f.content, force=payload.force)
        results.append(r)
        if r["status"] == "indexed":
            newly_indexed += r.get("lines", 0)

    billing.record(who["account_id"], "index", indexed_lines=newly_indexed)
    return {"repo": repo, "submitted": len(results),
            "indexed": sum(1 for r in results if r["status"] == "indexed"),
            "unchanged": sum(1 for r in results if r["status"] == "unchanged"),
            "results": results,
            "content_retained": False,
            "rate_remaining": who["rate_remaining"]}


@app.delete("/v1/repos/{repo}/files", tags=["index"])
def delete_file(repo: str, path: str = Query(...), who: dict = Depends(caller)) -> dict:
    return index.delete_file(f"{who['account_id']}/{repo}", path)


@app.get("/v1/repos", tags=["index"])
def list_repos(who: dict = Depends(caller)) -> dict:
    prefix = who["account_id"] + "/"
    return {"repos": [r[len(prefix):] for r in index.list_repos() if r.startswith(prefix)]}


@app.get("/v1/repos/{repo}/stats", tags=["index"])
def repo_stats(repo: str, who: dict = Depends(caller)) -> dict:
    s = index.repo_stats(f"{who['account_id']}/{repo}")
    s["repo"] = repo
    return s


# --- navigation ---------------------------------------------------------------

@app.get("/v1/repos/{repo}/card", tags=["navigate"])
def get_card(repo: str, path: str = Query(..., description="File to profile"),
             render: bool = Query(True, description="Include the compact text rendering"),
             who: dict = Depends(caller)) -> dict:
    try:
        card = index.card(f"{who['account_id']}/{repo}", path)
    except KeyError:
        raise HTTPException(404, f"{path} is not indexed in repo '{repo}'")

    text = None
    if render:
        from loomcode.index import Card, Symbol
        text = Card(path=card["path"], language=card["language"], lines=card["lines"],
                    bytes=card["bytes"], content_hash="", module_intent=card["module_intent"],
                    imports=card["imports"], sections=card["sections"],
                    symbols=[Symbol(**{k: s[k] for k in
                                       ("name", "kind", "line_start", "line_end",
                                        "signature", "intent", "parent", "complexity")})
                             for s in card["symbols"]],
                    exact=card["exact"], notes=card["notes"]).render()

    served = len(text.encode()) if text else len(str(card).encode())
    billing.record(who["account_id"], "card", bytes_served=served, bytes_full=card["bytes"])
    return {**card, "rendered": text,
            "context": {"bytes_served": served, "bytes_if_full_read": card["bytes"],
                        "reduction_factor": round(card["bytes"] / served, 2) if served else None}}


@app.get("/v1/repos/{repo}/search", tags=["navigate"])
def search(repo: str, q: str = Query(..., min_length=2, description="Natural-language query"),
           top_k: int = Query(8, ge=1, le=50), who: dict = Depends(caller)) -> dict:
    hits = index.search(f"{who['account_id']}/{repo}", q, top_k=top_k)
    billing.record(who["account_id"], "search", bytes_served=len(str(hits).encode()))
    return {"query": q, "count": len(hits), "results": hits,
            "next": "call /card for a file's shape, or /read for the exact lines"}


@app.get("/v1/repos/{repo}/locate", tags=["navigate"])
def locate(repo: str, name: str = Query(..., description="Exact symbol name"),
           who: dict = Depends(caller)) -> dict:
    hits = index.locate(f"{who['account_id']}/{repo}", name)
    return {"name": name, "count": len(hits), "matches": hits,
            "ambiguous": len(hits) > 1,
            "hint": "pass path= to /read_symbol when a name appears more than once"
                    if len(hits) > 1 else None}


# --- reading ------------------------------------------------------------------

@app.post("/v1/repos/{repo}/read", tags=["read"])
def read(payload: ReadRequest, repo: str, who: dict = Depends(caller)) -> dict:
    if payload.end < payload.start:
        raise HTTPException(400, "end must be >= start")
    try:
        r = read_lines(payload.content, payload.start, payload.end, pad=payload.pad)
    except ValueError as e:
        raise HTTPException(400, str(e))
    billing.record(who["account_id"], "read", bytes_served=r["bytes"],
                   bytes_full=len(payload.content.encode()))
    return {**r, "path": payload.path,
            "context": {"bytes_served": r["bytes"],
                        "bytes_if_full_read": len(payload.content.encode()),
                        "reduction_factor": round(len(payload.content.encode()) / r["bytes"], 2)
                        if r["bytes"] else None}}


@app.post("/v1/repos/{repo}/read_symbol", tags=["read"])
def read_symbol(payload: SymbolReadRequest, repo: str, who: dict = Depends(caller)) -> dict:
    scoped = f"{who['account_id']}/{repo}"
    hits = index.locate(scoped, payload.name)
    if payload.path:
        hits = [h for h in hits if h["path"] == payload.path]
    if not hits:
        raise HTTPException(404, f"symbol '{payload.name}' not found in repo '{repo}'")
    if len(hits) > 1:
        # Surface the ambiguity rather than picking one — guessing which
        # `validate` was meant is how the wrong file gets edited.
        return JSONResponse(status_code=409, content={
            "error": "ambiguous symbol", "name": payload.name, "candidates": hits,
            "hint": "resend with 'path' set to one of the candidate paths"})
    h = hits[0]
    r = read_lines(payload.content, h["line_start"], h["line_end"], pad=payload.pad)
    billing.record(who["account_id"], "read_symbol", bytes_served=r["bytes"],
                   bytes_full=len(payload.content.encode()))
    return {"symbol": h, **r,
            "context": {"bytes_served": r["bytes"],
                        "bytes_if_full_read": len(payload.content.encode()),
                        "reduction_factor": round(len(payload.content.encode()) / r["bytes"], 2)
                        if r["bytes"] else None}}


# --- structure ----------------------------------------------------------------

@app.get("/v1/repos/{repo}/graph", tags=["structure"])
def graph(repo: str, rebuild: bool = Query(False, description="Force resolution to rerun"),
          who: dict = Depends(caller)) -> dict:
    """Call-graph summary: node and edge counts, broken down by confidence.

    The breakdown is the point. A repo whose edges are mostly ``ambiguous`` has
    a naming problem, and any tool that navigates it — including this one — is
    guessing more often than it looks.
    """
    scoped = f"{who['account_id']}/{repo}"
    if rebuild:
        index.build_graph(scoped)
    stats = index.graph_summary(scoped)
    return {"repo": repo, **stats,
            "confidence_meaning": {
                "exact": "one definition of that name in the same file",
                "likely": "one definition in the whole repo",
                "ambiguous": "several definitions share the name; all recorded",
                "external": "no definition indexed — a dependency or a builtin"}}


@app.get("/v1/repos/{repo}/important", tags=["structure"])
def important(repo: str, top_k: int = Query(20, ge=1, le=200),
              who: dict = Depends(caller)) -> dict:
    """The repo map — symbols ranked by PageRank over the call graph.

    What to read first in a codebase nobody on the team has seen. Centrality
    answers that; a text index cannot, because the most important function is
    rarely the one whose name matches your question.
    """
    rows = index.important(f"{who['account_id']}/{repo}", top_k=top_k)
    billing.record(who["account_id"], "important", bytes_served=len(str(rows).encode()))
    return {"repo": repo, "count": len(rows), "symbols": rows,
            "ranking": "pagerank over confidence-weighted call edges"}


@app.get("/v1/repos/{repo}/relations", tags=["structure"])
def relations(repo: str, name: str = Query(..., description="Symbol name"),
              path: str | None = Query(None, description="Disambiguate a repeated name"),
              who: dict = Depends(caller)) -> dict:
    """Callers, callees and external calls for one symbol, each with confidence."""
    try:
        rel = index.relations(f"{who['account_id']}/{repo}", name, path)
    except KeyError:
        raise HTTPException(404, f"symbol '{name}' not found in repo '{repo}'")
    if rel.get("ambiguous"):
        return JSONResponse(status_code=409, content={
            "error": "ambiguous symbol", **rel,
            "hint": "resend with 'path' set to one of the candidate paths"})
    return {"repo": repo, **rel}


@app.post("/v1/repos/{repo}/context_pack", tags=["structure"])
def context_pack(payload: ContextPackRequest, repo: str,
                 who: dict = Depends(caller)) -> dict:
    """Everything needed to make one edit, under a token budget.

    The difference from ``/search`` is that this answers "what do I need in
    front of me", not "where is it": the matched span, what it calls, what calls
    it, its file's other symbols by name, and cards for the other files that
    came up — filled in that priority order until the budget runs out, with
    whatever did not fit reported rather than dropped silently.
    """
    scoped = f"{who['account_id']}/{repo}"
    contents = {f.path: f.content for f in payload.files}
    anchor = None
    if payload.anchor:
        hits = index.locate(scoped, payload.anchor)
        if payload.anchor_path:
            hits = [h for h in hits if h["path"] == payload.anchor_path]
        if len(hits) == 1:
            anchor = (hits[0]["path"], payload.anchor)
        elif len(hits) > 1:
            raise HTTPException(409, f"anchor '{payload.anchor}' is ambiguous; "
                                     "set anchor_path to one of its locations")
    result = index.context_pack(scoped, payload.query, contents,
                                budget_tokens=payload.budget_tokens, anchor=anchor)
    billing.record(who["account_id"], "context_pack",
                   bytes_served=len(result.get("rendered", "").encode()),
                   bytes_full=sum(len(c.encode()) for c in contents.values()))
    return {"repo": repo, **result}


# --- account ------------------------------------------------------------------

@app.get("/v1/usage", tags=["account"])
def usage(days: int = Query(30, ge=1, le=365), who: dict = Depends(caller)) -> dict:
    return billing.usage_summary(who["account_id"], days=days)


@app.get("/v1/account", tags=["account"])
def account(who: dict = Depends(caller)) -> dict:
    plan = PLANS[who["plan"]]
    used = billing.indexed_lines(who["account_id"])
    return {"account_id": who["account_id"], "email": who["email"], "plan": plan.as_dict(),
            "indexed_lines_used": used,
            "indexed_lines_remaining": max(plan.max_indexed_lines - used, 0)}
