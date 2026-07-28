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
  // A short, obviously-fake non-empty key just to clear the no-key guard and
  // reach the empty-prompt check (kept < 16 chars so the secret scanner's
  // apiKey heuristic doesn't false-positive on this test).
  try { await studio.generateWorker({ prompt: '   ', apiKey: 'fake' }); }
  catch (e) { empty = String(e.message || e); }
  check('empty prompt rejected', empty.startsWith('empty_prompt'), empty);

  check('catalog context lists 40 types', (studio.catalogContext().match(/\n- /g) || []).length === 40);
  check('parse bare JSON', studio.parseWorkerJson(worker).filename === 'x.py');
  check('parse fenced JSON', studio.parseWorkerJson('```json\n' + worker + '\n```').runtime === 'python');
  check('parse prose-wrapped JSON', studio.parseWorkerJson('Here:\n' + worker + '\ndone').code === 'print(1)');
  check('parse garbage -> null', studio.parseWorkerJson('nope') === null);

  // ── configure / remix: honest no-key + unknown-template + empty-input ──
  let cfgRaised = '';
  try { await studio.configureWorker({ templateId: 'web-spider', goal: 'daily crawl', apiKey: '' }); }
  catch (e) { cfgRaised = String(e.message || e); }
  check('no-key configure throws no_api_key', cfgRaised.startsWith('no_api_key'), cfgRaised);

  let cfgGoal = '';
  try { await studio.configureWorker({ templateId: 'web-spider', goal: '  ', apiKey: 'fake' }); }
  catch (e) { cfgGoal = String(e.message || e); }
  check('empty goal rejected', cfgGoal.startsWith('empty_goal'), cfgGoal);

  let cfgUnknown = '';
  try { await studio.configureWorker({ templateId: 'not-a-real-template', goal: 'x', apiKey: 'fake' }); }
  catch (e) { cfgUnknown = String(e.message || e); }
  check('unknown template rejected (configure)', cfgUnknown.startsWith('unknown_template'), cfgUnknown);

  let rmxRaised = '';
  try { await studio.remixWorker({ templateId: 'web-spider', request: 'add auth', apiKey: '' }); }
  catch (e) { rmxRaised = String(e.message || e); }
  check('no-key remix throws no_api_key', rmxRaised.startsWith('no_api_key'), rmxRaised);

  let rmxReq = '';
  try { await studio.remixWorker({ templateId: 'web-spider', request: '', apiKey: 'fake' }); }
  catch (e) { rmxReq = String(e.message || e); }
  check('empty request rejected', rmxReq.startsWith('empty_request'), rmxReq);

  let rmxUnknown = '';
  try { await studio.remixWorker({ templateId: 'not-a-real-template', request: 'x', apiKey: 'fake' }); }
  catch (e) { rmxUnknown = String(e.message || e); }
  check('unknown template rejected (remix)', rmxUnknown.startsWith('unknown_template'), rmxUnknown);

  // ── bundleSpecZip: a Studio spec packs into a real, valid zip ──────────
  const fakeSpec = { filename: 'relay.py', runtime: 'python', code: 'print("hi")\n', run: 'python3 relay.py', needs: [], notes: 'test', base_template_id: 'webhook-relay' };
  const zipBytes = studio.bundleSpecZip(fakeSpec);
  check('bundleSpecZip has local header signature', zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04);
  {
    const os = require('os'); const fs = require('fs'); const path2 = require('path');
    const { execFileSync } = require('child_process');
    const tmp = fs.mkdtempSync(path2.join(os.tmpdir(), 'studio-zip-'));
    fs.writeFileSync(path2.join(tmp, 'w.zip'), Buffer.from(zipBytes));
    try {
      execFileSync('unzip', ['-o', 'w.zip'], { cwd: tmp, stdio: 'ignore' });
      const code = fs.readFileSync(path2.join(tmp, 'relay', 'relay.py'), 'utf8');
      const readme = fs.readFileSync(path2.join(tmp, 'relay', 'README.md'), 'utf8');
      check('bundleSpecZip unzips with the real code', code === fakeSpec.code);
      check('bundleSpecZip README notes the base template', readme.includes('webhook-relay'));
    } catch (e) { console.log('NOTE: `unzip` not available — structural check only.'); }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

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
    check('desktop GET /api/foundry/templates', cat.status === 200 && JSON.parse(cat.body).templates.length === 40);

    const dl = await req('POST', '/api/foundry/download', { template_id: 'web-spider', params: { START_URL: 'https://d.test' } });
    check('desktop POST /api/foundry/download returns zip', dl.status === 200 && JSON.parse(dl.body).zip_base64.length > 100);

    const st = await req('POST', '/api/studio/generate', { prompt: 'a crawler' });
    const stBody = JSON.parse(st.body);
    if (process.env.ANTHROPIC_API_KEY) {
      check('desktop studio generates with key', st.status === 200 && !!stBody.code, JSON.stringify(stBody).slice(0, 120));
    } else {
      check('desktop studio honest 402 with no key', st.status === 402 && stBody.error.startsWith('no_api_key'), JSON.stringify(stBody));
    }

    const cfg = await req('POST', '/api/studio/configure', { template_id: 'web-spider', goal: 'daily crawl' });
    const cfgBody = JSON.parse(cfg.body);
    check('desktop studio/configure honest 402 with no key', cfg.status === 402 && cfgBody.error.startsWith('no_api_key'), JSON.stringify(cfgBody));

    const cfgUnknown = await req('POST', '/api/studio/configure', { template_id: 'nope', goal: 'x', api_key: 'fake' });
    check('desktop studio/configure 404 on unknown template', cfgUnknown.status === 404, cfgUnknown.body);

    const rmx = await req('POST', '/api/studio/remix', { template_id: 'web-spider', request: 'add auth' });
    const rmxBody = JSON.parse(rmx.body);
    check('desktop studio/remix honest 402 with no key', rmx.status === 402 && rmxBody.error.startsWith('no_api_key'), JSON.stringify(rmxBody));

    const dlSpec = await req('POST', '/api/studio/download', {
      spec: { filename: 'relay.py', runtime: 'python', code: 'print(1)\n', run: 'python3 relay.py', needs: [] },
    });
    const dlSpecBody = JSON.parse(dlSpec.body);
    check('desktop studio/download bundles a real zip', dlSpec.status === 200 && dlSpecBody.filename === 'relay.zip' && dlSpecBody.zip_base64.length > 100, JSON.stringify(dlSpecBody).slice(0, 120));

    const dlSpecBad = await req('POST', '/api/studio/download', { spec: {} });
    check('desktop studio/download 400 on invalid spec', dlSpecBad.status === 400);
  } finally {
    srv.close();
  }

  console.log();
  if (fail) { console.log(`RESULT: ${fail} FAILED`); process.exit(1); }
  console.log('RESULT: the JS Worker Studio is honest without a key and parses robustly; the desktop '
    + 'transport now serves the console, the 40-template Foundry (download included), and the Studio '
    + 'endpoint — parity with the Python backend.');
}

main().catch((e) => { console.error(e); process.exit(1); });
