# Weekly Command Center

A multi-stack platform for running an extremely busy professional's week —
built to actually run today, not just describe itself. This directory is
self-contained; it does not depend on anything else in this repository.

## Run it right now (no Docker required)

```sh
cd apps/weekly-command-center
./run_local.sh
```

Then open **http://localhost:3000**. That's the whole platform: this week's
digest, deliverables under deadline pressure, a recursive task tree with a
quick-add bar that understands the task language, versioned documents in
recursive folders, a live calendar strip, and the library/dependency
registry.

`run_local.sh` only needs `python3` and `node` — both already on this
machine — and starts:
- `core-api` (Python/FastAPI) on `:8000`
- `gateway-node` (Node/Express, serves the web UI and proxies `/api/*`) on `:3000`

## Run the full stack, including the Julia/Haskell services

```sh
docker compose up --build
```

This adds:
- `optimizer-julia` on `:8100` — a real deadline/priority-weighted scheduling
  algorithm (greedy bin-pack + bounded local-swap improvement)
- `taskrules-haskell` on `:8200` — a real recursive-descent parser for the
  task-language quick-add syntax

`core-api` calls these two over HTTP and **transparently falls back to an
equivalent pure-Python implementation** if they aren't running
(`app/clients/julia_client.py`, `app/clients/haskell_client.py`). So the
platform is never blocked on the Julia/Haskell containers being up — they're
a real accelerant layer, not a hard dependency, which is why `run_local.sh`
alone is already a complete, usable app.

## How the requirements map to what's actually implemented

| Ask | Where it lives |
|---|---|
| Full multi-stack, "enveloped" app | `gateway-node/` is the envelope: one HTTP surface fronting Python, Julia, and Haskell services. `docker-compose.yml` wires all four; `run_local.sh` runs the Python+Node core directly. |
| Keeps up week after week, never loses the thread | `core-api/app/weeks.py`: every week row points at `previous_week_id`. `get_thread()` walks that chain back as far as you want. Unfinished tasks are copied forward on rollover, tagged `carried_over_from` so the UI can show what's been alive across multiple weeks. |
| Ancient calendars as "deep root code" | `core-api/app/calendars.py` — real calendrical math (Julian Day Number, Mayan Long Count/Tzolkin/Haab via the GMT correlation constant, tabular Hijri, Chinese sexagenary cycle), verified against known reference dates in `tests/test_core.py`. Not decorative; every value is derived from the actual date. |
| Ancient "task languages" | `taskrules-haskell/src/TaskLang.hs` — a one-line DSL (`due:`, `!priority`, `~estimate`, `#tag`, `@deliverable:`, `^parent:`) parsed with real recursive-descent parsing. |
| Python + Julia + Haskell "intelligent entities" | Python (`core-api`) is the orchestrator. Julia (`optimizer-julia`) does the numeric scheduling optimization. Haskell (`taskrules-haskell`) does the language/grammar parsing. Each is a real, independently runnable service, not a stub. |
| Node, local, web, "our own cloud" | Node (`gateway-node`) is the API gateway + static web UI. It runs locally via `run_local.sh`, in a browser as a normal web app, and `docker-compose.yml` is your own self-hosted "cloud" — deploy it to any VM or container host you control. |
| "Nothing is static, everything recursive" | Documents are append-only (`document_revisions` — a save never overwrites, `documents.py`); folders nest arbitrarily (`list_folder_tree`); tasks nest arbitrarily (`tasks.get_tree`); weeks recursively chain to the week before. |
| Library/dependency database | `core-api/app/library_registry.py` scans the real `requirements.txt`, `package.json`, `Project.toml`, and `.cabal` files in this directory (not hand-maintained) and serves them at `/api/libraries` — the "Library & dependency registry" panel in the UI. |
| Inner agents (system) vs outer agent (you) | `core-api/app/agents/inner_agent.py` runs unattended housekeeping (deadline-pressure recompute, week rollover, library rescans) on a schedule. `core-api/app/agents/outer_agent.py` builds the digest that's actually shown to you. |
| Native documents/files/folders/notes | `core-api/app/documents.py` + the Documents panel in the UI: recursive folders, notes with full version history. |
| Inner AI stays on top of the week, knows deliverable dates, pressured by them, aware of email as context (not tasks) | `deliverables.py` computes a non-linear `pressure` score from each due date; `outer_agent.build_digest()` surfaces the highest-pressure item and carried-over count. `integrations/email_context.py` scans `.eml` files dropped into `core-api/data/inbox/` for mentioned dates/subjects and links them to deliverables **as read-only context** — it never auto-creates a task from an email. |

## Directory layout

```
core-api/            Python/FastAPI — source of truth (SQLite), agents, calendars, registry
optimizer-julia/     Julia/HTTP.jl — week-scheduling optimizer
taskrules-haskell/   Haskell/Scotty — task-language parser
gateway-node/        Node/Express — API gateway + static web UI
docker-compose.yml   Full stack, including the Julia/Haskell services
run_local.sh         Zero-Docker quickstart (Python + Node only)
```

## Tests

```sh
cd core-api
pip install -r requirements.txt pytest
python3 -m pytest tests/ -v
```

Covers: calendar math against known reference dates, week continuity/rollover,
recursive task trees, deliverable pressure scoring, document revision
history, and the library registry scanner.
