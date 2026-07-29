---
name: aether-demo-record
description: Use this skill when the user wants a demo video, product walkthrough, or screen recording of the Aether Sovereign Platform (console, desktop app, or Foundry/Studio flows) — "record a demo", "make a walkthrough video", "show this feature working", "polish this recording". Produces real, pixel-for-pixel captured usage of the actual running app, polished with title cards, zoom-ins, and captions — never a synthetic or staged "someone using it" video.
---

# Recording real demo videos of Aether

Two non-negotiable rules, in order:

1. **Only real usage, captured.** Every clip comes from a headless Chromium
   (Playwright) actually driving one of this platform's real servers — the
   desktop app (`apps/aether-desktop/server.js`), the Python backend
   (`python3 -m aether_platform.api.server`), or Cloudflare Pages dev. Never
   generate synthetic "person using the product" footage, never mock up UI
   states that don't exist, never invent an interaction the app doesn't
   actually support. If a real flow ends in an honest error (e.g. no
   `ANTHROPIC_API_KEY` set), record that — it's correct, not a bug to hide.
2. **Captions describe only what's verifiably on screen.** Before writing a
   single caption, extract real frames from the raw capture (`ffmpeg -i
   raw.webm -vf fps=1 frames/f_%03d.png`) and read them. A caption is a
   claim about pixels that exist in the file, not a summary of what you
   intended to happen.

## The tools

`tools/demo-recorder/` has two small, generic, reusable scripts — nothing
project-specific is hardcoded in them:

- **`record.js`** — launches headless Chromium, points it at a real URL,
  records real video, and runs a "steps" module you write (real
  `page.click` / `page.fill` / `page.type` / `scrollIntoViewIfNeeded` calls
  against selectors you've confirmed exist in the real markup).
- **`polish.js`** — turns that raw capture into a polished clip from a JSON
  cutlist: intro/outro title cards, per-segment captions, optional punch-in
  zoom crops. It only outputs frames you explicitly reference by timestamp —
  nothing is invented.

`tools/demo-recorder/examples/` has two working, tested references:
`console-foundry.steps.js` (catalog → configure Price Tracker → real zip
download) and `console-forge-intelligence.steps.js` (all three Forge
Intelligence modes: New worker / Configure / Remix), plus a matching
`.polish.json` for the latter. Read one before writing a new one.

## Workflow

**1. Start the real server the flow needs**, e.g.:
```bash
node -e "
const { createServer } = require('./apps/aether-desktop/server.js');
createServer('/tmp/demo-state.json', 7801, '127.0.0.1');
" &
sleep 1 && curl -s http://127.0.0.1:7801/api/health   # confirm it's actually up
```

**2. Write a steps module** (see `examples/*.steps.js`). It exports
`async function run(page, { pause })`. Read the real page source
(`apps/aether-console/index.html`) for selectors — never guess a
`data-*` attribute or class name. Start with a deterministic
`await page.waitForSelector(...)` for real content, not a fixed sleep:
`record.js` intentionally uses `domcontentloaded`, not `networkidle`,
because this platform's heartbeat/polling loop means `networkidle` can
silently wait 10–20s before ever resolving.

**3. Record it:**
```bash
cd tools/demo-recorder
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node record.js \
  --url http://127.0.0.1:7801/ \
  --steps examples/your-flow.steps.js \
  --outdir /tmp/demo-raw
```
Expect several seconds of blank/lead-in video before real content appears
— that's headless-Chromium + video-encoder startup, not a bug. It's
harmless: `polish.js` only pulls the timestamp ranges you tell it to, so
any dead lead-in never makes it into the final cut.

**4. Extract and read real frames before writing a single caption:**
```bash
ffmpeg -i /tmp/demo-raw/*.webm -vf fps=1 /tmp/demo-frames/f_%03d.png
```
Open several with the Read tool. Note the real timestamp where each
interaction actually becomes visible (typed text, an error message, a
downloaded-file toast). Do not estimate — read the frames.

**5. Write a `.polish.json`** (schema documented at the top of
`polish.js`, real example in `examples/console-forge-intelligence.polish.json`):
segments with verified `start`/`end` and a caption that states only what
that segment shows. For a punch-in on one region of the UI, add
`"crop": {"w":1280,"h":720,"x":X,"y":Y}` (1280×720 → 1.5x zoom) or
`{"w":960,"h":540,...}` (2x zoom) — always 16:9, so `scale` back to
`videoSize` never distorts. Get `x`/`y` by reading the pixel coordinates
of the region in a real extracted frame, never by guessing.

**6. Render and spot-check:**
```bash
node polish.js --config examples/your-flow.polish.json
ffmpeg -ss 5 -i out/your-flow.polished.mp4 -frames:v 1 check.png   # read it back
```

## Brand reference

Public/light pages (the marketing Foundry page): background `0xF3F1EC`,
headline `0x1A1A1A`, accent `0xE6491F`. Console (dark): background
`0x0A0E18`, text white, secondary `0x9FB3D9`, accent blue `0x2F6FED`. Font:
`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` (already on the box).
