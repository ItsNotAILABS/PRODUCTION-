# Organism Command Deck

A real, zero-dependency local web app — the first visible product surface for
the sovereign organism runtime. Dark, golden-ratio-driven design matching the
main site's visual identity, built on top of the math we already shipped and
validated in `organism/python`.

```bash
node apps/control-center/server.js
# → http://localhost:4873
```

No `npm install`, no build step, no external services. The server is plain
Node `http`/`fs`, the page is plain HTML/CSS/canvas JS.

## What's real vs. simulated

- **Pipeline panel** (build status, phase results, system registry) — real.
  Fetched live from `docs/sandcastle-summary.json` on every page load, so it
  always reflects the last `node scripts/sandcastle-pipeline.js --report` run.
- **Connectome panel** (the golden-angle particle field, coherence R, beat
  count) — a faithful client-side port of `organism.physics.mean_field_kuramoto_step`
  and `organism.physics.order_parameter`, running entirely in the browser on
  the organism's real 873ms heartbeat and PHI/golden-angle constants. It is
  **not** a live feed from the NeuroEmergence Core canister — it's the same
  validated math, run locally, same as the Python `NeuroEmergenceCore` client.
- **Vitality** — computed with the exact phi-weighted register weights from
  `organism.vitality` (`PHI**4 : PHI**3 : PHI**2 : PHI**1`), fed by the local
  connectome's own coherence/sync signal rather than fabricated numbers.

## Layout

- `index.html` — the entire app (markup, styles, client JS, no bundler).
- `server.js` — static file server + two read-only JSON/markdown endpoints
  (`/api/sandcastle-summary`, `/api/sandcastle-report`) that proxy straight
  through to `docs/` in the repo root. Read-only, no writes, confined to
  serving this app's own directory for static files.

## Roadmap

The footer chip strip is an honest status line, not aspirational marketing —
chips marked "planned" or "auditing" are not wired yet:

- Julia engine — planned, not started.
- Haskell engine — planned, not started.
- Bot/MCP federation wiring — in progress (audit underway).
