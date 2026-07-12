# optimizer-julia

The real numeric "intelligent entity" that turns a pile of open tasks into a
Mon–Fri schedule. It's a deadline-aware, priority-weighted greedy bin-packer
(a variant of weighted job scheduling / interval bin-packing) with an
exhaustive local-swap improvement pass — not a token gesture at using Julia,
an actual algorithm that would be reasonable to hand-write in any language,
written in idiomatic Julia because numeric optimization is exactly what Julia
is fast and pleasant at.

## Run it

```sh
julia --project=. -e 'import Pkg; Pkg.instantiate()'
julia --project=. src/Optimizer.jl
# serves on http://localhost:8100
```

Or via the repo's `docker-compose.yml`, which builds this into its own
container automatically.

## API

`POST /optimize`
```json
{
  "tasks": [{"id": 1, "title": "...", "priority": 1, "estimate_minutes": 60, "deadline": "2026-07-06", "dependencies": []}],
  "daily_capacity_minutes": 360
}
```
returns `{"engine": "julia", "plan": {"Mon": [...], ...}, "overflow": [...], "remaining_capacity": {...}, "score": <float>}`.

If this service isn't running, `core-api` transparently falls back to an
equivalent pure-Python heuristic (see `core-api/app/clients/julia_client.py`)
so the platform never blocks on it being up.
