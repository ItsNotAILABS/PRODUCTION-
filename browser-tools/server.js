#!/usr/bin/env node
/**
 * Aether Browser Tools — DevTools, exposed as easy API calls.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Everything you normally open Chrome DevTools to do — run JS on a page,
 * watch the network, read console logs, grab the DOM, screenshot, print to
 * PDF, script a click-through — as a single HTTP POST. No launching a
 * browser, wiring CDP, or juggling async yourself. One persistent headless
 * Chromium (Playwright) serves every request in its own fresh context.
 *
 * Endpoints (all POST, JSON in/out):
 *   /browser/eval       {url, expression}        -> value + console + network
 *   /browser/scrape     {url, selectors}         -> fields by CSS (sel@attr, sel[])
 *   /browser/screenshot {url, fullPage, width}   -> {png_base64}
 *   /browser/pdf        {url}                     -> {pdf_base64}
 *   /browser/network    {url}                     -> [{method,url,status,type}]
 *   /browser/console    {url}                     -> [{type,text}]
 *   /browser/snapshot   {url}                     -> {title, html, text, links, metrics}
 *   /browser/automate   {start, script}           -> per-step results + console + network
 *   GET /health                                   -> {status, browser}
 *
 * Run:
 *   node server.js --port 8830           # needs: npm i playwright (or global)
 *   curl -s localhost:8830/browser/snapshot -d '{"url":"https://example.com"}'
 */
'use strict';
const http = require('http');
const { URL } = require('url');

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) {
    // fall back to a global install (e.g. /opt/node22/lib/node_modules)
    const mod = require('module');
    for (const p of mod.globalPaths) { try { return require(require('path').join(p, 'playwright')); } catch {} }
    throw new Error('playwright not found — run: npm i playwright');
  }
}

let _browser = null;
async function browser() {
  if (_browser) return _browser;
  const { chromium } = loadPlaywright();
  try { _browser = await chromium.launch({ headless: true }); }
  catch (e) {
    const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
    _browser = await chromium.launch({ headless: true, executablePath: exe });
  }
  return _browser;
}

/** Open a page with console + network capture; run fn(page); always clean up. */
async function withPage(opts, fn) {
  const b = await browser();
  const ctx = await b.newContext(opts.context || {});
  const page = await ctx.newPage();
  const consoleLogs = [];
  const network = [];
  page.on('console', (m) => consoleLogs.push({ type: m.type(), text: m.text() }));
  page.on('request', (r) => network.push({ method: r.method(), url: r.url(), type: r.resourceType() }));
  page.on('response', (r) => { const e = network.find(n => n.url === r.url() && n.status === undefined); if (e) e.status = r.status(); });
  try {
    const timeout = opts.timeout || 30000;
    if (opts.url) await page.goto(opts.url, { waitUntil: opts.waitUntil || 'networkidle', timeout });
    const result = await fn(page);
    return { result, console: consoleLogs, network: network.slice(0, 300) };
  } finally {
    await ctx.close();
  }
}

// ── selector picker shared with the dom-scraper worker template ──────────
const PICK_FN = (sel) => {
  const pick = (spec) => {
    let all = false, attr = null, css = spec;
    if (css.includes('@')) { const p = css.split('@'); css = p[0]; attr = p[1]; }
    if (css.endsWith('[]')) { all = true; css = css.slice(0, -2); }
    const nodes = Array.from(document.querySelectorAll(css));
    const val = (n) => attr ? n.getAttribute(attr) : (n.textContent || '').trim();
    return all ? nodes.map(val) : (nodes[0] ? val(nodes[0]) : null);
  };
  const r = {};
  for (const [k, spec] of Object.entries(sel)) r[k] = pick(spec);
  return r;
};

const HANDLERS = {
  async eval(body) {
    const { result, console: c, network } = await withPage({ url: body.url }, (p) => p.evaluate(body.expression || 'document.title'));
    return { url: body.url, value: result, console: c, network };
  },
  async scrape(body) {
    const { result } = await withPage({ url: body.url }, (p) => p.evaluate(PICK_FN, body.selectors || {}));
    return { url: body.url, fields: result };
  },
  async screenshot(body) {
    const width = parseInt(body.width || 1280, 10);
    const { result } = await withPage(
      { url: body.url, context: { viewport: { width, height: Math.round(width * 0.75) } } },
      async (p) => (await p.screenshot({ fullPage: body.fullPage !== false })).toString('base64'));
    return { url: body.url, png_base64: result };
  },
  async pdf(body) {
    const { result } = await withPage({ url: body.url }, async (p) => (await p.pdf({ format: 'A4' })).toString('base64'));
    return { url: body.url, pdf_base64: result };
  },
  async network(body) {
    const { network } = await withPage({ url: body.url }, async () => null);
    return { url: body.url, requests: network };
  },
  async console(body) {
    const { console: c } = await withPage({ url: body.url }, async () => null);
    return { url: body.url, logs: c };
  },
  async snapshot(body) {
    const { result, network } = await withPage({ url: body.url }, (p) => p.evaluate(() => ({
      title: document.title,
      text: (document.body ? document.body.innerText : '').slice(0, 20000),
      html: document.documentElement.outerHTML.slice(0, 200000),
      links: Array.from(document.querySelectorAll('a[href]')).map(a => a.href).slice(0, 500),
      metrics: { nodes: document.getElementsByTagName('*').length,
                 images: document.images.length, forms: document.forms.length },
    })));
    return { url: body.url, ...result, network_count: network.length };
  },
  async automate(body) {
    const script = body.script || [];
    const { result, console: c, network } = await withPage(
      { url: body.start, waitUntil: 'domcontentloaded' }, async (page) => {
        const steps = [];
        for (const step of script) {
          try {
            if (step.goto) await page.goto(step.goto, { waitUntil: 'domcontentloaded', timeout: 30000 });
            else if (step.click) await page.click(step.click, { timeout: 15000 });
            else if (step.type) await page.fill(step.type[0], step.type[1]);
            else if (step.wait) await page.waitForTimeout(step.wait);
            else if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 15000 });
            else if (step.eval !== undefined) { steps.push({ step, ok: true, value: await page.evaluate(step.eval) }); continue; }
            steps.push({ step, ok: true });
          } catch (e) { steps.push({ step, ok: false, error: String(e.message || e) }); }
        }
        return { finalUrl: page.url(), steps };
      });
    return { start: body.start, ...result, console: c, network };
  },
};

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

async function main() {
  const pi = process.argv.indexOf('--port');
  const port = pi >= 0 ? parseInt(process.argv[pi + 1], 10) : parseInt(process.env.PORT || '8830', 10);
  const host = process.env.HOST || '127.0.0.1';

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const path = new URL(req.url, `http://${host}`).pathname;
    if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'ready', browser: !!_browser });
    if (req.method !== 'POST' || !path.startsWith('/browser/')) return send(res, 404, { error: 'not_found' });
    const name = path.slice('/browser/'.length);
    const handler = HANDLERS[name];
    if (!handler) return send(res, 404, { error: `unknown_tool: ${name}`, tools: Object.keys(HANDLERS) });
    const body = await readBody(req);
    if (!body.url && !body.start) return send(res, 400, { error: 'url required' });
    try { send(res, 200, await handler(body)); }
    catch (e) { send(res, 500, { error: String(e.message || e) }); }
  });

  server.listen(port, host, () => console.log(`[browser-tools] http://${host}:${port} — DevTools as an API (${Object.keys(HANDLERS).length} tools)`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { if (_browser) await _browser.close(); process.exit(0); });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { HANDLERS, withPage, browser };
