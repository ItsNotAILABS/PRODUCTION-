// MCP wire smoke for Council.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, 'server.mjs');

const child = spawn(process.execPath, [server], { stdio: ['pipe','pipe','pipe'] });
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
  console.log(C('\n=== COUNCIL MCP WIRE ===\n'));

  send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{} }});
  const init = await waitFor(1);
  assert('initialize', init.result?.serverInfo?.name === 'loom-council');

  send({ jsonrpc:'2.0', method:'notifications/initialized' });

  send({ jsonrpc:'2.0', id:2, method:'tools/list' });
  const list = await waitFor(2);
  const names = list.result.tools.map(t=>t.name);
  assert('tools/list = 5', names.length === 5 && names.includes('council_vote'), names.join(','));

  send({ jsonrpc:'2.0', id:3, method:'tools/call', params:{
    name:'council_open', arguments:{ task_id:'wire', prompt:'ship?' }}});
  assert('open via MCP', content(await waitFor(3)).ok);

  for (const [id, agent, role, conf] of [
    [4, 'lead',    'LEAD',        0.9],
    [5, 'analyst', 'ANALYST',     0.85],
    [6, 'synth',   'SYNTHESIZER', 0.8],
  ]) {
    send({ jsonrpc:'2.0', id, method:'tools/call', params:{
      name:'council_vote', arguments:{ task_id:'wire', agent_id:agent, role, content:'ship', confidence:conf }}});
    assert(`vote ${agent} via MCP`, content(await waitFor(id)).ok);
  }

  send({ jsonrpc:'2.0', id:7, method:'tools/call', params:{ name:'council_resolve', arguments:{ task_id:'wire' }}});
  const res = content(await waitFor(7));
  assert('resolve approves at ratio ≥ φ⁻¹', res.approved && res.approvalRatio >= 0.618,
    `ratio=${res.approvalRatio}`);

  send({ jsonrpc:'2.0', id:8, method:'tools/call', params:{ name:'council_status', arguments:{} }});
  const st = content(await waitFor(8));
  assert('status reports APPROVED count', st.ok && st.APPROVED === 1);

  console.log(C('\n=== RESULT ===\n') + (process.exitCode===1 ? R('  failure\n') : G('  Council MCP green\n')));
} finally {
  child.kill();
}
