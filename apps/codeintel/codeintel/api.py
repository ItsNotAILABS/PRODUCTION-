"""Code Intelligence API — navigate a codebase without loading it.

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
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from codeintel.billing import PLANS, Billing
from codeintel.index import CodeIndex, profile_text, read_lines

DB = os.environ.get("CODEINTEL_DB", "codeintel.db")
index = CodeIndex(DB)
billing = Billing(DB)

app = FastAPI(
    title="Code Intelligence API",
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
                                 "'Authorization: Bearer ci_...'")
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
    return {"status": "ok", "service": "codeintel", "version": app.version}


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
        from codeintel.index import Card, Symbol
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
