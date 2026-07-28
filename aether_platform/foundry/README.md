# Aether Worker Foundry

Spinning up a headless worker should be **one pick and one download**, not an
afternoon of boilerplate. The Foundry ships 40 real, runnable worker types and
a generator that bakes your parameters into a ready-to-run file — plus a
**Studio** where Claude writes a custom worker from a plain-language
description.

## The 40 types

| category | types |
|---|---|
| compute | mesh compute node (native pull), mesh compute node (HTTP push), work-queue consumer, distributed map, rate-limited reverse proxy, task scheduler |
| web | web spider, sitemap crawler, broken-link checker, RSS/Atom poller, API poller (record diff), price tracker, keyword alert |
| browser | screenshot worker, DOM scraper, browser automation, PDF renderer, form filler, visual diff (all headless Chromium via Playwright) |
| data | HTTP batch caller, webhook relay, ETL normalizer, JSON diff watcher, dedupe worker, CSV merger, schema validator |
| ai | LLM relay (Claude), embedding worker, classification relay, summarization worker, moderation worker |
| ops | uptime monitor, log shipper, cron runner, Prometheus metrics scraper, directory sync, disk usage monitor, TLS certificate expiry monitor, backup worker, process watchdog |

Every one is a **real program**, not a stub: `manifest.json` describes them and
`templates/<id>/` holds the actual files with `{{TOKEN}}` parameters. Most are
pure Python stdlib; the browser ones are Node + Playwright.

## Use it

**From the console** (recommended): run the platform and open the Worker
Foundry tab —

```bash
python3 -m aether_platform.api.server     # serves the console + Foundry + Studio
# open http://localhost:7700  → "Worker Foundry"
```

Pick a type, fill the parameters, hit **Download** — you get a zip with the
worker, a generated `README.md`, and a `run.sh`. Or use the **Forge
Intelligence** panel and let Claude do one of three things: write something
new, recommend a configuration for an existing blueprint, or remix an
existing blueprint's real source into a new one (see Studio, below).

**From the API:**

```
GET  /api/foundry/templates                 → catalog (metadata only)
POST /api/foundry/generate  {template_id, params}  → {files: {path: content}}
POST /api/foundry/download  {template_id, params}  → {zip_base64}
POST /api/studio/generate   {prompt}               → a Claude-built worker
POST /api/studio/configure  {template_id, goal}     → {params, rationale}
POST /api/studio/remix      {template_id, request}  → a Claude-adapted worker
POST /api/studio/download   {spec}                  → {zip_base64} for a generate/remix result
```

**From Python:**

```python
from aether_platform.foundry import Foundry
f = Foundry()
rendered = f.render("web-spider", {"START_URL": "https://example.com", "MAX_PAGES": "50"})
open("spider.py", "w").write(rendered["files"]["spider.py"])
# or a full bundle:
open("spider.zip", "wb").write(f.bundle_zip("web-spider", {"START_URL": "..."}))
```

## Studio (Claude, working inside the Foundry)

Three modes, all backed by the Anthropic API (default `claude-opus-4-8`),
all grounded in the real Foundry catalog/source so results match the house
style — and all **honest about credentials**: with no `ANTHROPIC_API_KEY`
every one returns `402 no_api_key` and a clear message, never a fake worker.
The 40 ready-made types download with no key regardless.

- **`generate`** — free-text prompt → a brand-new worker, written from scratch.
- **`configure`** — pick an existing blueprint + describe the goal → Claude
  recommends values for its declared parameters only (never invents new
  ones), which you can forge straight into a real zip via
  `/api/foundry/download`.
- **`remix`** — pick an existing blueprint + describe a change → Claude is
  given that blueprint's actual rendered source as a starting point and
  hands back a new, complete worker (`base_template_id` records what it
  started from).

`generate` and `remix` results go through `/api/studio/download`, which
bundles them into the same real deliverable a Foundry download gets: the
worker file, a generated `README.md`, and an executable `run.sh` — not a bare
code snippet.

## Tested, not asserted

`test_foundry.py`: all 40 render with every declared param substituted (no
placeholder leaks), every generated Python compiles and every Node file passes
`node --check`, param overrides land in the output, the zip is well-formed, and
sampled workers actually **run** — the ETL normalizer transforms a real CSV and
the spider crawls a live local site. The `dom-scraper` template was separately
driven against real headless Chromium. `test_studio.py`: the honest no-key
path (across all three Studio modes), catalog grounding, robust JSON parsing,
and `bundle_zip()` producing a well-formed zip all pass without a key.
