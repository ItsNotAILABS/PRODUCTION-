# Loom Code

Selective retrieval for coding agents. Navigate a codebase without loading it.

An agent that needs to change 20 lines of a 900-line module currently reads all
900. Across a repository that saturates the context window before the system is
understood — and the tokens are billed either way. This service replaces that
with a pipeline: **parse → resolve → rank → pack**.

**Measured on this service's own source** (2,295 lines, 8 modules, 124 symbols):

| | |
|---|---|
| profile card size | **8.1%** of the source it describes |
| six real edit tasks, as packs | 8,454 tokens vs **23,356** reading the matched file whole |
| reduction | **2.76×** (14,902 tokens avoided) |
| bare span read, no relations | **8.76×** — the cheaper mode |
| resolved call graph | 356 edges: 88 exact, 45 likely, 2 ambiguous, 221 external |

Two numbers, because reporting only the flattering one would misdescribe what
you get. A bare span read is the bigger multiple; a **context pack** is the more
useful answer, and costs more precisely because it brings the callers and
callees with it.

No model inference, no GPU, no external calls. Parsing is an AST walk; ranking
is BM25 fused with PageRank. Latency and cost are CPU-bound, which is what makes
it sellable per-seat rather than per-token.

## Languages

Exact line spans, from a real parse: **Python** (stdlib `ast`), and via
tree-sitter **Go, TypeScript, JavaScript, PHP, Pascal/Delphi, Java, Rust, Ruby,
Kotlin**. Anything else is indexed as metadata and says so.

The previous release scanned everything but Python with a regex and marked the
spans `exact: false`. That was honest but not useful — you cannot edit against a
boundary found by looking for the *next* declaration.

Each grammar needed its own correction, and both have tests: Go puts a method's
receiver first, so a naive read indexes `func (c *Catalog) Total` as `c`; Delphi
declares a routine twice and writes `procedure TCatalog.Total`, where the leading
identifier is the owner, not the member.

## Confidence

Every call edge says how much was actually known when it was resolved. A graph
that hides its guesses is worse than no graph — an agent follows the wrong edge
into the wrong file and never learns the edge was a guess.

| tier | means | how it can be wrong |
|---|---|---|
| `exact` | one definition of that name in the same file | it can't; local scope resolves it |
| `likely` | one definition in the whole repo | an import of a same-named third-party symbol |
| `ambiguous` | several share the name — **all** recorded | it doesn't guess; you get every candidate |
| `external` | no definition indexed | kept, not dropped: a leaf calling into an SDK is not self-contained |

Confidence feeds PageRank, so a guessed edge moves less rank than a resolved
one. Without that, a hub forms purely because the name `get` is popular.

Calls with no navigational value (`len`, `append`, `toString`) are filtered —
on this repo they were 4 in every 5 edges and buried the real dependencies.
Exception constructors are deliberately kept: "this raises `ValueError`" is part
of a function's contract.

## Ranking

Three signals, each failing somewhere the others don't: lexical BM25 (fails when
the question's words aren't the code's words), PageRank centrality (fails on
anything peripheral), and graph proximity to an anchor (useless without one).

They fuse with **Reciprocal Rank Fusion** — positions, not scores. A BM25 score
of 7.4 and a PageRank of 0.003 have no defensible exchange rate, and any
weighted sum of them is really a weighting of their variances.

Dense retrieval is a `DenseProvider` slot with nothing in it, on purpose: the
moment an embedding model is in the request path, the claim that a request costs
CPU and nothing else is gone. Bring your own and it fuses as a fourth ranker.

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

# ...or ask for everything needed to make the edit, under a budget
curl -X POST $API/v1/repos/myrepo/context_pack -H "Authorization: Bearer $KEY" \
  -d '{"query":"optimal price from elasticity","budget_tokens":1200,
       "files":[{"path":"src/pricing.py","content":"..."}]}'
# -> the span, its callers and callees, the file's other symbols, cards for
#    other files that matched — each cited as path:Lstart-Lend, plus an
#    explicit list of what did not fit and why
```

A pack fills in priority order — matched span, callees, callers, siblings by
name, then file cards — and every tier is capped as well as ordered. Priority
alone is not enough: one hot utility with sixty callers would consume an entire
32k budget on tier three and leave nothing for the file map.

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
| `GET` | `/v1/repos/{repo}/graph` | edge counts by confidence tier |
| `GET` | `/v1/repos/{repo}/important` | the repo map — PageRank over the call graph |
| `GET` | `/v1/repos/{repo}/relations` | callers, callees, external calls for one symbol |
| `POST` | `/v1/repos/{repo}/context_pack` | budgeted pack: span + relations + citations |
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
export LOOM_KEY_SALT=$(openssl rand -hex 32)   # required; rotating invalidates keys
docker compose up -d

# accounts and keys are created via shell, never over HTTP
docker compose exec loomcode python admin.py account create you@co.com --plan team
docker compose exec loomcode python admin.py key issue acct_xxx --label ci
```

Or without Docker:

```bash
pip install -r requirements.txt
LOOM_KEY_SALT=$(openssl rand -hex 32) uvicorn loomcode.api:app --port 8080
```

## Browser clients

Nothing in a browser — an editor webview, a web IDE, a dashboard, the demo in
`demo/` — can call this service until CORS allows its origin. The browser
refuses before the request is sent, so this is a hard prerequisite rather than a
nicety.

```bash
LOOM_CORS_ORIGINS=https://app.yourco.com,https://ide.yourco.com \
  uvicorn loomcode.api:app --port 8080
```

Unset, no origin is allowed and no CORS headers are emitted: an operator opts in
to exactly the front-ends they run rather than inheriting a wildcard. Credentials
are never allowed — auth here is a bearer token, not a cookie, so there is
nothing to gain by widening the surface.

## Demo and showcase

```bash
# serve the demo page and point it at a running instance
python3 -m http.server 8898 --directory demo
open 'http://127.0.0.1:8898/index.html?api=http://127.0.0.1:8080&key=lc_...'
```

`demo/index.html` indexes `demo/pricing.py` and `demo/orders.py` live, then runs
the same edit both ways side by side — whole files on the left, the ranked hits
and the assembled pack on the right, with confidence badges on each cross-file
relation. Every counter is filled from the actual responses. The page must be
served over http; Chrome blocks `fetch()` on `file://` outright, so it cannot
load its own samples from disk.

Two files, not one, because a call graph built from a single file only ever
produces `exact` edges — which makes the confidence tiers look like decoration.

`demo/record.mjs` drives that page with a real browser and records it. Nothing
is staged: if the API breaks, the video breaks.

```bash
node demo/record.mjs --api http://127.0.0.1:8080 --key lc_... \
  --url http://127.0.0.1:8898/index.html
```

`site/` is the marketing page. `site/index.html` is the source and keeps
`__VIDEO__` / `__POSTER__` placeholders so its diffs stay readable;
`python3 site/build.py` inlines the media as data URIs into a single
self-contained `site/dist/index.html` that renders with no external requests.

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
python3 -m pytest tests/ -q     # 71 passing
```

Weighted toward what a customer or security reviewer will probe: tenant
isolation (including for the derived graph), quota enforcement, revoked keys,
key hashing, and refusing to guess which of two same-named symbols you meant
(409 with candidates, never a silent pick).

Plus, for the pipeline: that every reported span actually contains the symbol it
names in each language, that a Go method is not filed under its receiver, that
a Delphi forward declaration does not double the symbol count, that PageRank is
a distribution rather than a call count, that RRF prefers agreement across
signals over one confident pick, and that a pack never exceeds its budget and
reports what it cut.

## Known limits

- Spans are exact for the ten supported languages. Anything else is metadata
  only, and the card says so rather than returning a guess.
- Search is lexical plus structural — no embeddings ship. It matches wording and
  graph position, not meaning: it finds `optimal_price` from "optimal price from
  elasticity" because those words are present, and will miss a symbol whose
  purpose is only inferable.
- Resolution matches on the trailing name, so `a.b.parse(x)` resolves as
  `parse`. Receiver types are not inferred — which is exactly why the confidence
  tier is on every edge instead of hidden.
- Rate limiting is a fixed per-minute window, so it is coarse at boundaries.
  Adequate for abuse control; not a fairness guarantee.
- SQLite backs the index. Fine to low millions of symbols on one node; a
  multi-node deployment needs Postgres.
