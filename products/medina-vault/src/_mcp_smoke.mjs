// _mcp_smoke.mjs — spawn the server and exercise MCP over stdio.
// Verifies the wire shape any AI tool will actually see.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, 'server.mjs');
const VAULT_PATH = join(tmpdir(), `medina-vault-mcp-smoke-${Date.now()}.json`);

const child = spawn(process.execPath, [server], {
  env: { ...process.env, MEDINA_VAULT_PATH: VAULT_PATH, MEDINA_OPERATOR_ID: 'tester' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

const responses = [];
let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) responses.push(JSON.parse(line));
  }
});

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

async function waitFor(id, timeoutMs = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = responses.find((m) => m.id === id);
    if (r) return r;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout waiting for id=${id}; stderr=${stderrBuf}`);
}

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;

function assert(name, cond, detail = '') {
  console.log(`  ${cond ? G('PASS') : R('FAIL')}  ${name}${detail ? '  · ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

function parseContent(res) {
  return JSON.parse(res.result.content[0].text);
}

try {
  console.log(C('\n=== MCP WIRE SMOKE ===\n'));

  send({ jsonrpc: '2.0', id: 1, method: 'initialize',
         params: { protocolVersion: '2024-11-05', capabilities: {} } });
  const init = await waitFor(1);
  assert('initialize replies with serverInfo',
    init.result?.serverInfo?.name === 'medina-vault',
    `name=${init.result?.serverInfo?.name}`);

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = await waitFor(2);
  const toolNames = list.result.tools.map((t) => t.name);
  assert('tools/list exposes 9 vault tools',
    toolNames.length === 9 &&
    toolNames.includes('vault_store') &&
    toolNames.includes('vault_search') &&
    toolNames.includes('vault_lineage'),
    toolNames.join(','));

  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'vault_store',
    arguments: { key: 'k1', value: { note: 'first' }, tier: 'PRIVATE' },
  }});
  const w1 = parseContent(await waitFor(3));
  assert('store genesis via MCP', w1.ok && w1.lineage_depth === 1, JSON.stringify(w1));

  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
    name: 'vault_retrieve', arguments: { key: 'k1' },
  }});
  const r1 = parseContent(await waitFor(4));
  assert('retrieve returns entry + head_hash', r1.ok && typeof r1.head_hash === 'string',
    `head=${r1.head_hash?.slice(0,12)}…`);

  send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: {
    name: 'vault_store',
    arguments: { key: 'k1', value: { note: 'second' }, tier: 'PRIVATE',
                 prior_hash: r1.head_hash },
  }});
  const w2 = parseContent(await waitFor(5));
  assert('recited update via MCP', w2.ok && w2.lineage_depth === 2, JSON.stringify(w2));

  send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: {
    name: 'vault_store',
    arguments: { key: 'k1', value: { note: 'no recital' }, tier: 'PRIVATE',
                 prior_hash: 'a'.repeat(64), agent_id: 'intruder' },
  }});
  const w3 = parseContent(await waitFor(6));
  assert('recital mismatch surfaces on MCP', !w3.ok && w3.reason === 'RECITAL_MISMATCH', w3.reason);

  send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
    name: 'vault_status', arguments: {},
  }});
  const st = parseContent(await waitFor(7));
  assert('status reports protocol + operator',
    st.ok && st.protocol === 'MEDINA-PROTOCOL/0.1' && st.operator === 'tester',
    `protocol=${st.protocol} op=${st.operator}`);

  console.log(C('\n=== RESULT ===\n') +
    (process.exitCode === 1 ? R('  failure\n') : G('  MCP wire green — installable in Claude Desktop\n')));
} finally {
  child.kill();
  await import('node:fs').then(fs => fs.promises.unlink(VAULT_PATH).catch(() => {}));
}
