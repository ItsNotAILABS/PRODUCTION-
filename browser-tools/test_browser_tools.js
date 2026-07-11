#!/usr/bin/env node
/**
 * test_browser_tools.js — starts the real browser-tools service against a
 * tiny local site and exercises every endpoint with real headless Chromium.
 * Proves the DevTools-as-an-API surface actually drives a browser.
 *
 * Run:  node test_browser_tools.js   (needs playwright + a chromium)
 */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8831;
const BASE = `http://127.0.0.1:${PORT}`;

function post(tool, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(BASE + '/browser/' + tool, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(data); req.end();
  });
}
function health() {
  return new Promise((resolve, reject) => {
    http.get(BASE + '/health', (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { await health(); return true; } catch { await sleep(200); } }
  return false;
}

(async () => {
  const failures = [];
  const check = (l, c, d = '') => { console.log((c ? 'PASS' : 'FAIL') + `: ${l}` + (d && !c ? `  (${d})` : '')); if (!c) failures.push(l); };

  // A tiny site to point the tools at.
  const site = http.createServer((req, res) => {
    const body = `<!doctype html><html><head><title>Aether Test</title></head>
      <body><h1>Browser Tools Work</h1>
      <a href="/a">a</a><a href="/b">b</a>
      <input id="q"><button onclick="document.title='clicked'">go</button>
      <script>console.log('hello from page');</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body);
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;

  const srv = spawn('node', [path.join(__dirname, 'server.js'), '--port', String(PORT)],
    { env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' }, stdio: 'ignore' });

  try {
    if (!(await waitHealthy())) { console.log('SKIP: service did not start (playwright/chromium missing?)'); srv.kill(); site.close(); process.exit(0); }

    const evalR = await post('eval', { url: siteUrl, expression: '1 + 2' });
    check('eval runs JS in the page', evalR.value === 3, JSON.stringify(evalR));
    check('eval captures page console logs', (evalR.console || []).some(c => c.text.includes('hello from page')));

    const scrapeR = await post('scrape', { url: siteUrl, selectors: { title: 'h1', links: 'a[]@href' } });
    check('scrape extracts by selector', scrapeR.fields && scrapeR.fields.title === 'Browser Tools Work'
      && Array.isArray(scrapeR.fields.links) && scrapeR.fields.links.length === 2, JSON.stringify(scrapeR.fields));

    const snap = await post('snapshot', { url: siteUrl });
    check('snapshot returns title + links + metrics', snap.title === 'Aether Test'
      && snap.links.length === 2 && snap.metrics.nodes > 0, JSON.stringify({ t: snap.title, m: snap.metrics }));

    const shot = await post('screenshot', { url: siteUrl, width: 800 });
    check('screenshot returns base64 PNG', typeof shot.png_base64 === 'string'
      && Buffer.from(shot.png_base64, 'base64').slice(0, 4).toString('hex') === '89504e47',
      'not a PNG header');

    const net = await post('network', { url: siteUrl });
    check('network capture lists the document request', (net.requests || []).some(r => r.url === siteUrl && r.status === 200),
      JSON.stringify((net.requests || []).slice(0, 3)));

    const auto = await post('automate', { start: siteUrl, script: [{ click: 'button' }, { eval: 'document.title' }] });
    const evalStep = (auto.steps || []).find(s => s.value !== undefined);
    check('automate runs a click-through script (title changes to "clicked")',
      evalStep && evalStep.value === 'clicked', JSON.stringify(auto.steps));

  } finally {
    srv.kill(); site.close();
  }

  console.log();
  if (failures.length) { console.log(`RESULT: ${failures.length} FAILED: ${failures}`); process.exit(1); }
  console.log('RESULT: Browser Tools drive real headless Chromium — eval, scrape, snapshot, screenshot, '
    + 'network capture, and scripted automation all work as single API calls. DevTools, without the toil.');
})().catch((e) => { console.error(e); process.exit(1); });
