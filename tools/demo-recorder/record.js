#!/usr/bin/env node
// Generic headless-browser recorder: drives a REAL running server with
// Playwright and records real pixel-for-pixel video of the interaction.
// This produces genuine usage, captured — never a synthetic "someone using
// the product" video. See ../../.claude/skills/aether-demo-record/SKILL.md.
//
// Usage:
//   node record.js --url http://127.0.0.1:7801/ --steps examples/foo.steps.js --outdir out/
//
// Optional:
//   --width 1920 --height 1080   (default 1920x1080)
//   --shim-downloads             inject the claude.ai artifact runtime's
//                                 window.claude.downloads.save() shim, for
//                                 recording pages built against that API
//                                 outside the sandboxed viewer.
//
// The steps file must export `async function run(page, ctx)`. `ctx` carries
// { pause } — a small delay helper — and nothing else; do real Playwright
// calls (click/fill/type/scrollIntoViewIfNeeded/mouse.wheel) against real
// selectors you've confirmed exist by reading the actual rendered page.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

function parseArgs(argv) {
  const out = { width: 1920, height: 1080, shimDownloads: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--steps') out.steps = argv[++i];
    else if (a === '--outdir') out.outdir = argv[++i];
    else if (a === '--width') out.width = parseInt(argv[++i], 10);
    else if (a === '--height') out.height = parseInt(argv[++i], 10);
    else if (a === '--shim-downloads') out.shimDownloads = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  for (const req of ['url', 'steps', 'outdir']) {
    if (!out[req]) throw new Error(`--${req} is required`);
  }
  return out;
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = loadPlaywright();
  const stepsFn = require(path.resolve(args.steps)).run;
  if (typeof stepsFn !== 'function') {
    throw new Error(`${args.steps} must export an async function "run(page, ctx)"`);
  }

  fs.mkdirSync(args.outdir, { recursive: true });

  const executablePath = fs.existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined;

  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: args.width, height: args.height },
    recordVideo: { dir: args.outdir, size: { width: args.width, height: args.height } },
    acceptDownloads: true,
  });

  if (args.shimDownloads) {
    // Mirrors the real claude.ai artifact runtime's downloads capability so
    // a recording of an artifact-shaped page matches what actually happens
    // when published, instead of the sandboxed-viewer fallback path.
    await ctx.addInitScript(() => {
      window.claude = {
        downloads: {
          save: async ({ filename }) => {
            const el = document.createElement('div');
            el.textContent = `Saved: ${filename}`;
            el.style.cssText =
              'position:fixed;top:18px;left:50%;transform:translateX(-50%);' +
              'background:#1b2129;color:#e8ecf1;border:1px solid #ff6a3d;border-radius:8px;' +
              'padding:10px 16px;font:600 15px -apple-system,sans-serif;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4)';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2600);
            return { status: 'saved' };
          },
        },
      };
    });
  }

  const page = await ctx.newPage();
  // Not 'networkidle': apps with a heartbeat/poll loop (this platform has
  // one) never go network-idle, which silently prepends many seconds of
  // blank video while Playwright waits it out. 'domcontentloaded' plus an
  // explicit waitForSelector for real content, done in the steps module, is
  // the deterministic way to know the page is actually ready to interact with.
  await page.goto(args.url, { waitUntil: 'domcontentloaded' });

  try {
    await stepsFn(page, { pause });
  } finally {
    await page.close();
    await ctx.close();
    await browser.close();
  }

  const files = fs.readdirSync(args.outdir).filter((f) => f.endsWith('.webm'));
  console.log('Recorded:', files.map((f) => path.join(args.outdir, f)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
