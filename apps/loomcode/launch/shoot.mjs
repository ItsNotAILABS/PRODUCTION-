/**
 * shoot.mjs — render the launch gallery to PNGs at exact pixel sizes.
 *
 * Product Hunt gallery images are 1270x760 and the thumbnail is 240x240. Those
 * are composed at true size in cards.html and captured by element clip, so what
 * uploads is what was designed — no scaling, no letterbox, no "close enough"
 * crop that leaves a hairline of background down one edge.
 *
 *   node shoot.mjs [--out assets]
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, args.out || "assets");
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ["#c1", "01-hero.png"],
  ["#c2", "02-pipeline.png"],
  ["#c3", "03-confidence.png"],
  ["#c4", "04-languages.png"],
  ["#c5", "05-numbers.png"],
  ["#thumb", "thumbnail.png"],
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
});

// deviceScaleFactor 2 gives a retina-sharp upload; Product Hunt downsamples it
// cleanly, whereas a 1x capture of 13px monospace looks soft on any modern
// display.
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("file://" + path.join(HERE, "cards.html"), { waitUntil: "load" });
await page.waitForTimeout(400);

const written = [];
for (const [selector, name] of SHOTS) {
  const el = await page.$(selector);
  if (!el) {
    errors.push(`missing element ${selector}`);
    continue;
  }
  const box = await el.boundingBox();
  const file = path.join(OUT, name);
  await el.screenshot({ path: file });
  written.push({ name, css: `${Math.round(box.width)}x${Math.round(box.height)}`,
                 bytes: fs.statSync(file).size });
}

await context.close();
await browser.close();

console.log(JSON.stringify({ out: OUT, written, errors }, null, 2));
if (errors.length) process.exit(2);
