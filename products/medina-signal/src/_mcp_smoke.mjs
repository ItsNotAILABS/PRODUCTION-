import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, 'server.mjs');
const BUS_PATH = join(tmpdir(), `medina-signal-mcp-smoke-${Date.now()}.json`);

const child = spawn(process.execPath, [server], {
  env: { ...process.env, MEDINA_SIGNAL_PATH: BUS_PATH, MEDINA_OPERATOR_ID: 'tester' },
  stdio: ['pipe','pipe','pipe'],
});
let stderrBuf = '';
child.stderr.on('data', d => stderrBuf += d.toString());

const responses = [];
let buf = '';
child.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i+1);
    if (line) responses.push(JSON.parse(line));
  }
});

function send(m) { child.stdin.write(JSON.stringify(m) + '\n'); }
async function waitFor(id, ms=2000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = responses.find(m => m.id === id);
    if (r) return r;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`timeout id=${id} stderr=${stderrBuf}`);
}
const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d=''){ console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  · '+d:''}`); if(!c) process.exitCode=1; }
function content(r){ return JSON.parse(r.result.content[0].text); }

try {
  console.log(C('\n=== SIGNAL MCP WIRE ===\n'));

  send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{} }});
  const init = await waitFor(1);
  assert('initialize', init.result?.serverInfo?.name === 'loom-signal');

  send({ jsonrpc:'2.0', method:'notifications/initialized' });

  send({ jsonrpc:'2.0', id:2, method:'tools/list' });
  const list = await waitFor(2);
  const names = list.result.tools.map(t=>t.name);
  assert('tools/list = 6', names.length === 6 && names.includes('signal_emit'), names.join(','));

  send({ jsonrpc:'2.0', id:3, method:'tools/call', params:{
    name:'signal_register', arguments:{ agent_id:'claude', role:'LEAD' }}});
  assert('register lead via MCP', content(await waitFor(3)).ok);

  send({ jsonrpc:'2.0', id:4, method:'tools/call', params:{
    name:'signal_register', arguments:{ agent_id:'cursor', role:'CRITIC' }}});
  assert('register critic via MCP', content(await waitFor(4)).ok);

  send({ jsonrpc:'2.0', id:5, method:'tools/call', params:{
    name:'signal_emit', arguments:{ from:'claude', subject:'review:needed',
      payload:'PR #42', type:'ROLE', to:'CRITIC', priority:'HIGH' }}});
  assert('emit ROLE+HIGH via MCP', content(await waitFor(5)).ok);

  send({ jsonrpc:'2.0', id:6, method:'tools/call', params:{
    name:'signal_inbox', arguments:{ agent_id:'cursor' }}});
  const i = content(await waitFor(6));
  assert('inbox delivers ROLE signal to CRITIC',
    i.ok && i.signals.length === 1 && i.signals[0].subject === 'review:needed');

  send({ jsonrpc:'2.0', id:7, method:'tools/call', params:{
    name:'signal_inbox', arguments:{ agent_id:'claude' }}});
  const i2 = content(await waitFor(7));
  assert('ROLE signal NOT delivered to LEAD',
    i2.ok && !i2.signals.some(s => s.subject === 'review:needed'));

  send({ jsonrpc:'2.0', id:8, method:'tools/call', params:{
    name:'signal_status', arguments:{} }});
  const st = content(await waitFor(8));
  assert('status reports protocol + agents',
    st.ok && st.protocol === 'MEDINA-PROTOCOL/0.1' && st.agents_registered === 2);

  console.log(C('\n=== RESULT ===\n') + (process.exitCode===1 ? R('  failure\n') : G('  Signal MCP green\n')));
} finally {
  child.kill();
  await import('node:fs').then(fs => fs.promises.unlink(BUS_PATH).catch(()=>{}));
}
