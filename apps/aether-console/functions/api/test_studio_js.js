/**
 * test_studio_js.js — JS Worker Studio + desktop-server wiring.
 *
 * Runs fully without an API key: the honest-failure path and the JSON parser.
 * Then boots the REAL desktop server and drives it over HTTP to confirm the
 * Foundry + Studio routes work on that transport (Studio returns an honest 402
 * with no key; Foundry download returns a real zip; the console static serves).
 * If ANTHROPIC_API_KEY is set, it also does one live generation.
 *
 * Run:  node apps/aether-console/functions/api/test_studio_js.js
 */
'use strict';
const http = require('http');
const path = require('path');
const studio = require('./studio.js');

let fail = 0;
const check = (label, cond, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + `: ${label}` + (detail && !cond ? `  (${detail})` : ''));
  if (!cond) fail++;
};

const worker = '{"filename":"x.py","runtime":"python","code":"print(1)","run":"python3 x.py","needs":[],"notes":"n"}';

async function main() {
  // ── unit: honest no-key + parsing ──────────────────────────────────
  let raised = '';
  try { await studio.generateWorker({ prompt: 'a spider', apiKey: '' }); }
  catch (e) { raised = String(e.message || e); }
  check('no-key generate throws no_api_key (never a fake worker)', raised.startsWith('no_api_key'), raised);

  let empty = '';
  try { await studio.generateWorker({ prompt: '   ', apiKey: 'unused-empty-prompt' }); }
  catch (e) { empty = String(e.message || e); }
  check('empty prompt rejected', empty.startsWith('empty_prompt'), empty);

  check('catalog context lists 20 types', (studio.catalogContext().match(/\n- /g) || []).length === 20);
  check('parse bare JSON', studio.parseWorkerJson(worker).filename === 'x.py');
  check('parse fenced JSON', studio.parseWorkerJson('```json\n' + worker + '\n```').runtime === 'python');
  check('parse prose-wrapped JSON', studio.parseWorkerJson('Here:\n' + worker + '\ndone').code === 'print(1)');
  check('parse garbage -> null', studio.parseWorkerJson('nope') === null);

  // ── e2e: desktop server serves Foundry + Studio ────────────────────
  const os = require('os');
  const { createServer } = require(path.resolve(__dirname, '..', '..', '..', 'aether-desktop', 'server.js'));
  const statePath = path.join(os.tmpdir(), 'aether-studio-e2e-' + Date.now() + '.json');
  const port = 7788;
  const srv = createServer(statePath, port, '127.0.0.1');
  await new Promise((r) => setTimeout(r, 300));

  const req = (method, p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });

  try {
    const home = await req('GET', '/');
    check('desktop serves console static', home.status === 200 && home.body.includes('Worker Foundry'));

    const cat = await req('GET', '/api/foundry/templates');
    check('desktop GET /api/foundry/templates', cat.status === 200 && JSON.parse(cat.body).templates.length === 20);

    const dl = await req('POST', '/api/foundry/download', { template_id: 'web-spider', params: { START_URL: 'https://d.test' } });
    check('desktop POST /api/foundry/download returns zip', dl.status === 200 && JSON.parse(dl.body).zip_base64.length > 100);

    const st = await req('POST', '/api/studio/generate', { prompt: 'a crawler' });
    const stBody = JSON.parse(st.body);
    if (process.env.ANTHROPIC_API_KEY) {
      check('desktop studio generates with key', st.status === 200 && !!stBody.code, JSON.stringify(stBody).slice(0, 120));
    } else {
      check('desktop studio honest 402 with no key', st.status === 402 && stBody.error.startsWith('no_api_key'), JSON.stringify(stBody));
    }
  } finally {
    srv.close();
  }

  console.log();
  if (fail) { console.log(`RESULT: ${fail} FAILED`); process.exit(1); }
  console.log('RESULT: the JS Worker Studio is honest without a key and parses robustly; the desktop '
    + 'transport now serves the console, the 20-template Foundry (download included), and the Studio '
    + 'endpoint — parity with the Python backend.');
}

main().catch((e) => { console.error(e); process.exit(1); });
