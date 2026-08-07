/**
 * record.mjs — capture a real demo video of the Code Intelligence API.
 *
 * This drives the actual demo page against the actual running service with a
 * real browser and records what happens. Nothing is staged: every number that
 * appears on screen came back from an HTTP call during the recording. If the
 * service breaks, the video breaks — which is the point of recording it this
 * way rather than animating a mockup.
 *
 *   node record.mjs --api http://127.0.0.1:8899 --key ci_xxx --out demo.webm
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const API = args.api || "http://127.0.0.1:8899";
const KEY = args.key || "";
const OUTDIR = args.outdir || "/tmp/codeintel-video";
const HERE = path.dirname(fileURLToPath(import.meta.url));

if (!KEY) {
  console.error("need --key <api key>");
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUTDIR, size: { width: 1280, height: 800 } },
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// The demo must be served over http, not opened from file://. Chrome blocks
// fetch() on file:// URLs outright ("cross origin requests are only supported
// for protocol schemes: chrome, data, http, https..."), so the page could not
// even load its own sample file. Serving it is also how it would really be
// deployed, and makes the CORS origin a normal http origin.
const base = args.url || `http://127.0.0.1:8898/index.html`;
const url = `${base}?api=${encodeURIComponent(API)}&key=${encodeURIComponent(KEY)}`;
await page.goto(url, { waitUntil: "domcontentloaded" });

// let the page index the file and report real repo stats
await page.waitForFunction(
  () => document.getElementById("repo-badge").textContent !== "no repo",
  { timeout: 20000 },
);
await wait(2200);

// run the loop — this fires real search + read_symbol calls
await page.click("#run");

// wait for the meters to be filled by actual API responses
await page.waitForFunction(
  () => document.getElementById("m-ratio").textContent !== "—",
  { timeout: 30000 },
);
await wait(3200);

// capture the final numbers straight off the page so the log matches the video
const summary = await page.evaluate(() => ({
  repo: document.getElementById("repo-badge").textContent,
  full: document.getElementById("m-full").textContent,
  served: document.getElementById("m-served").textContent,
  ratio: document.getElementById("m-ratio").textContent,
  tokens: document.getElementById("m-tokens").textContent,
  step: document.getElementById("step").textContent,
}));

await page.screenshot({ path: path.join(OUTDIR, "final-frame.png") });
await context.close();
await browser.close();

const videos = fs.readdirSync(OUTDIR).filter((f) => f.endsWith(".webm"));
console.log(JSON.stringify({ summary, errors, videos, outdir: OUTDIR }, null, 2));
if (errors.length) process.exit(2);
