# taskrules-haskell

A real recursive-descent parser (see `src/TaskLang.hs`) for the platform's
one-line task DSL — the "ancient task language" layer applied to modern
task capture. Haskell earns its place here because a small, order-independent
token grammar with a free-text remainder is exactly the kind of thing
algebraic parsing (`Maybe`/`Either` combinators over a token stream) expresses
more directly than imperative string-splitting.

Grammar:

```
<title...> [due:ISO8601] [!priority(1-5)] [~estimate] [#tag]* [@deliverable:Name] [^parent:id]
```

`~estimate` accepts `90` (raw minutes) or `1h30m` / `2h` / `45m`.

## Run it

```sh
cabal build
cabal run taskrules
# serves on http://localhost:8200
```

## API

`POST /parse` `{"line": "Draft report due:2026-07-10T17:00 !1 ~2h #client-acme"}`
returns
```json
{"title": "Draft report", "due": "2026-07-10T17:00", "priority": 1,
 "estimate_minutes": 120, "tags": ["client-acme"], "deliverable": null, "parent": null}
```

If this service isn't running, `core-api` falls back to an equivalent Python
regex parser (see `core-api/app/clients/haskell_client.py`) so quick-add never
blocks on the microservice being up.
