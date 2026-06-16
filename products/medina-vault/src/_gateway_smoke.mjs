// Smoke for api_gateway.mjs — REST endpoints, key auth, tool invocation.

import { ApiGateway, issueApiKey } from './api_gateway.mjs';
import { RootVault } from './root_vault.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

const ROOT = join(tmpdir(), `loom-root-gw-${Date.now()}.json`);
process.env.MEDINA_ROOT_VAULT_PATH = ROOT;
const { RootVault: RV } = await import('./root_vault.mjs?gw=' + Date.now());

console.log(C('\n=== API GATEWAY — SMOKE ===\n'));

const rv = new RV();
await rv.load();
const receipts = new ReceiptLedger();

// Tools to expose
let lastCallArgs = null;
const tools = {
  echo: {
    description: 'Echo back the input — for round-trip testing.',
    inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
    handler: async (a) => { lastCallArgs = a; return { ok: true, echo: a.msg }; },
  },
  add: {
    description: 'Add two numbers.',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
    handler: async (a) => ({ ok: true, sum: (a.a||0) + (a.b||0) }),
  },
};

const PORT = 8740 + Math.floor(Math.random() * 50);
const gw = new ApiGateway({ tools, rootVault: rv, receipts, port: PORT });
await gw.start();
const base = `http://localhost:${PORT}`;

// ── /health is open ──────────────────────────────────────────────────
const health = await fetch(base + '/health').then(r => r.json());
assert('/health open, reports tool_count + port',
  health.ok && health.port === PORT && health.tool_count === 2,
  JSON.stringify(health));

// ── /.well-known/openai-functions returns OpenAI function-call schema ──
const schema = await fetch(base + '/.well-known/openai-functions').then(r => r.json());
assert('OpenAI function-call schema exposes every tool',
  schema.count === 2 && schema.functions.some(f => f.name === 'echo' && f.parameters?.required?.includes('msg')),
  `count=${schema.count}`);

// ── /v1/tools requires Bearer key ────────────────────────────────────
const noAuth = await fetch(base + '/v1/tools').then(r => r.json());
assert('/v1/tools without Authorization returns NO_BEARER',
  noAuth.ok === false && noAuth.reason === 'NO_BEARER', noAuth.reason);

// ── Issue a key, retry with auth ─────────────────────────────────────
const issued = issueApiKey({ rootVault: rv, name: 'chatgpt', agent_id: 'chatgpt', operator: 'Medin' });
assert('issueApiKey returns lk_-prefixed bearer token',
  issued.ok && issued.key.startsWith('lk_') && issued.use.startsWith('Authorization: Bearer lk_'),
  `key=${issued.key?.slice(0, 16)}...`);

const list = await fetch(base + '/v1/tools', { headers: { Authorization: 'Bearer ' + issued.key } }).then(r => r.json());
assert('/v1/tools with valid key returns tool list + agent_id',
  list.ok && list.agent_id === 'chatgpt' && list.tools.length === 2,
  `agent=${list.agent_id} tools=${list.tools?.length}`);

// ── Invoke a tool via REST ───────────────────────────────────────────
const invoke = await fetch(base + '/v1/tools/echo', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + issued.key },
  body: JSON.stringify({ msg: 'hello from chatgpt' }),
}).then(r => r.json());
assert('POST /v1/tools/echo invokes the tool and returns its result',
  invoke.ok && invoke.echo === 'hello from chatgpt' && lastCallArgs?.msg === 'hello from chatgpt');

// ── Unknown tool returns TOOL_NOT_FOUND ──────────────────────────────
const unknownTool = await fetch(base + '/v1/tools/nope', {
  method: 'POST', headers: { Authorization: 'Bearer ' + issued.key },
}).then(r => r.json());
assert('unknown tool returns TOOL_NOT_FOUND',
  !unknownTool.ok && unknownTool.reason === 'TOOL_NOT_FOUND');

// ── Invalid key rejected ─────────────────────────────────────────────
const bad = await fetch(base + '/v1/tools', { headers: { Authorization: 'Bearer lk_fake' } }).then(r => r.json());
assert('invalid bearer returns INVALID_KEY',
  !bad.ok && bad.reason === 'INVALID_KEY');

// ── Each invocation appended a receipt ───────────────────────────────
const skillReceipts = receipts.list({ kind: 'skill_run', limit: 100 });
assert('every gateway invocation appends a skill_run receipt with via=http-gateway',
  skillReceipts.length >= 1 && skillReceipts[0].meta.via === 'http-gateway' && skillReceipts[0].agent === 'chatgpt');

await gw.stop();
await fs.unlink(ROOT).catch(() => {});

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  HTTP gateway online — Bearer auth, OpenAI schema, every call receipt-logged\n')));
