# Aether Browser Tools — DevTools as an API

Everything you open Chrome DevTools to do — run JS on a page, watch the
network, read console logs, grab the DOM, screenshot, print to PDF, script a
click-through — as a single HTTP POST. No launching a browser, wiring the
Chrome DevTools Protocol, or juggling async yourself. One persistent headless
Chromium (Playwright) serves every request in its own fresh context.

Built because using the real DevTools for repeated tasks is a lot of manual
work; this turns each panel into one call.

## Run

```bash
npm i playwright            # or use a global playwright install
node server.js --port 8830
```

## Tools (all POST JSON to `/browser/<tool>`)

| tool | body | returns |
|---|---|---|
| `eval` | `{url, expression}` | the JS value + captured console + network |
| `scrape` | `{url, selectors}` | fields by CSS (`sel@attr`, `sel[]` for all) |
| `screenshot` | `{url, fullPage, width}` | `{png_base64}` |
| `pdf` | `{url}` | `{pdf_base64}` |
| `network` | `{url}` | every request `{method,url,status,type}` |
| `console` | `{url}` | every console message `{type,text}` |
| `snapshot` | `{url}` | title, visible text, HTML, links, DOM metrics |
| `automate` | `{start, script}` | per-step results + console + network |

`automate` script actions: `{goto}`, `{click:"css"}`, `{type:["css","text"]}`,
`{wait:ms}`, `{waitFor:"css"}`, `{eval:"js"}`, run in order.

```bash
curl -s localhost:8830/browser/snapshot -d '{"url":"https://example.com"}'
curl -s localhost:8830/browser/scrape \
  -d '{"url":"https://example.com","selectors":{"h1":"h1","links":"a[]@href"}}'
```

## Verified

`test_browser_tools.js` starts the real service against a local site and
exercises every endpoint with actual headless Chromium — eval runs JS and
captures the page's console, scrape/snapshot extract by selector, screenshot
returns a valid PNG, network capture sees the document request, and a scripted
click-through changes the page. All pass.

## Relationship to the Foundry

The `browser-automation`, `dom-scraper`, and `screenshot-worker` templates in
the Worker Foundry are the *downloadable, standalone* form of these same
capabilities (one file you own and run). This service is the *always-on* form
the console calls live. They share the selector-picker logic so results match.
