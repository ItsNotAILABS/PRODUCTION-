# Code Intelligence API

Navigate a codebase without loading it into context.

An agent that needs to change 20 lines of a 900-line module currently reads all
900. Across a repository that saturates the context window before the system is
understood — and the tokens are billed either way. This service replaces that
with a two-step loop: find the symbol, then read only its lines.

**Measured on this service's own source** (898 lines, 3 files, 63 symbols):

| | |
|---|---|
| profile card size | **7–10%** of the file it describes |
| one agent session (6 targeted edits) | 8,086 bytes served vs **78,798** as whole files |
| reduction | **9.7×** |
| tokens avoided, that session | ~17,700 |

No model inference, no GPU, no external calls. Parsing is Python's `ast`;
ranking is BM25. Latency and cost are CPU-bound, which is what makes it
sellable per-seat rather than per-token.

## The loop

```bash
# 1. index (content is parsed then discarded — only the index is stored)
curl -X POST $API/v1/repos/myrepo/files -H "Authorization: Bearer $KEY" \
  -d '{"files":[{"path":"src/pricing.py","content":"..."}]}'

# 2. find it
curl "$API/v1/repos/myrepo/search?q=optimal+price+lerner" -H "Authorization: Bearer $KEY"
# -> {"name":"markup_price","path":"src/pricing.py","line_start":9,"line_end":14}

# 3. read only that
curl -X POST $API/v1/repos/myrepo/read_symbol -H "Authorization: Bearer $KEY" \
  -d '{"name":"markup_price","content":"...","path":"src/pricing.py"}'
# -> the 6 lines, plus how many bytes a full read would have cost
```

Every context-returning response reports `bytes_if_full_read` alongside
`bytes_served`, so the saving is visible per call rather than asserted in a
pitch deck.

## Endpoints

| method | path | purpose |
|---|---|---|
| `POST` | `/v1/repos/{repo}/files` | index files (batch, idempotent on unchanged content) |
| `DELETE` | `/v1/repos/{repo}/files?path=` | drop a file from the index |
| `GET` | `/v1/repos` | list your repos |
| `GET` | `/v1/repos/{repo}/stats` | files, lines, symbols, languages |
| `GET` | `/v1/repos/{repo}/card?path=` | the shape of one file |
| `GET` | `/v1/repos/{repo}/search?q=` | rank symbols by a natural-language query |
| `GET` | `/v1/repos/{repo}/locate?name=` | every symbol with an exact name |
| `POST` | `/v1/repos/{repo}/read` | line range, clamped and flagged if out of bounds |
| `POST` | `/v1/repos/{repo}/read_symbol` | a symbol's exact span; **409** if ambiguous |
| `GET` | `/v1/usage` | billing basis and value delivered |
| `GET` | `/v1/account` | plan and remaining headroom |
| `GET` | `/v1/plans`, `/health` | public, no auth |

Interactive docs at `/docs`, OpenAPI at `/openapi.json`.

## What happens to your source

Text submitted to `/files` is **parsed and discarded**. What persists is the
derived index: symbol names, line spans, the first line of each docstring, and a
content hash for change detection. Nothing reconstructs the file.

`/read` therefore takes the content to slice in the request — the service never
becomes a second copy of your repository. For organisations that cannot send
source over the wire at all, the identical application runs inside your
perimeter on the enterprise plan.

## Pricing

| plan | price | indexed lines | rate | deployment |
|---|---|---|---|---|
| Free | $0 | 25,000 | 60/min | hosted |
| Team | $99/mo | 1,000,000 | 600/min | hosted |
| Business | $499/mo | 10,000,000 | 3,000/min | hosted |
| Enterprise | $2,500/mo | unlimited | 100,000/min | **self-hosted** |

Billing is on **indexed lines** — the size of the estate under management — not
per request. Charging per call would penalise the customer for the tool working
as designed, since the entire value is fewer and smaller calls. Requests are
rate-limited for abuse control only.

`/v1/usage` reports `context_bytes_saved` separately: that is the value
delivered, and it is deliberately not what you are charged for.

## Run it

```bash
export CODEINTEL_KEY_SALT=$(openssl rand -hex 32)   # required; rotating invalidates keys
docker compose up -d

# accounts and keys are created via shell, never over HTTP
docker compose exec codeintel python admin.py account create you@co.com --plan team
docker compose exec codeintel python admin.py key issue acct_xxx --label ci
```

Or without Docker:

```bash
pip install -r requirements.txt
CODEINTEL_KEY_SALT=$(openssl rand -hex 32) uvicorn codeintel.api:app --port 8080
```

## Security posture

- API keys are stored as **salted SHA-256 hashes**; the plaintext is returned
  once at creation and is unrecoverable afterwards.
- The key prefix stored alongside the hash is a lookup aid and **cannot
  authenticate** — there is a test asserting this.
- Every index and query is scoped to the calling account. Two tenants using the
  same repo name see nothing of each other — also a test, not a claim.
- Account creation is CLI-only and deliberately unreachable over HTTP.

## Tests

```bash
python3 -m pytest tests/ -q     # 31 passing
```

Weighted toward what a customer or security reviewer will probe: tenant
isolation, quota enforcement, revoked keys, key hashing, and refusing to guess
which of two same-named symbols you meant (409 with candidates, never a silent
pick).

## Known limits

- **Python spans are exact** (real `ast` parse). JavaScript/TypeScript spans are
  from a regex scan and are marked `exact: false` in the card — good enough to
  navigate, not to edit against blindly. Other languages get metadata only.
- Search is lexical (BM25 over names, signatures, docstrings). It matches
  wording, not meaning: it will find `markup_price` from "optimal price lerner"
  because those words are present, and will miss a symbol whose purpose is only
  inferable.
- Rate limiting is a fixed per-minute window, so it is coarse at boundaries.
  Adequate for abuse control; not a fairness guarantee.
- SQLite backs the index. Fine to low millions of symbols on one node; a
  multi-node deployment needs Postgres.
