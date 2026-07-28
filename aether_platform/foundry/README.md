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
worker, a generated `README.md`, and a `run.sh`. Or type a description into the
Studio and let Claude build one.

**From the API:**

```
GET  /api/foundry/templates                 → catalog (metadata only)
POST /api/foundry/generate  {template_id, params}  → {files: {path: content}}
POST /api/foundry/download  {template_id, params}  → {zip_base64}
POST /api/studio/generate   {prompt}               → a Claude-built worker
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

## Studio (Claude-built workers)

`POST /api/studio/generate {prompt}` uses the Anthropic API (default
`claude-opus-4-8`) with the Foundry catalog as context, so generated workers
match the house style. It is **honest about credentials**: with no
`ANTHROPIC_API_KEY` it returns `402 no_api_key` and a clear message — never a
fake worker. The 40 ready-made types download with no key.

## Tested, not asserted

`test_foundry.py`: all 40 render with every declared param substituted (no
placeholder leaks), every generated Python compiles and every Node file passes
`node --check`, param overrides land in the output, the zip is well-formed, and
sampled workers actually **run** — the ETL normalizer transforms a real CSV and
the spider crawls a live local site. The `dom-scraper` template was separately
driven against real headless Chromium. `test_studio.py`: the honest no-key
path, catalog grounding, and robust JSON parsing all pass without a key.
