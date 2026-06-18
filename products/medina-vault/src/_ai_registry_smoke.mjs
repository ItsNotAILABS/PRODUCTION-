// Smoke for ai_registry + tier gating through ApiGateway.

import { AIRegistry } from './ai_registry.mjs';
import { ApiGateway, issueApiKey } from './api_gateway.mjs';
import { RootVault } from './root_vault.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

const ROOT = join(tmpdir(), `loom-airegistry-${Date.now()}.json`);
process.env.MEDINA_ROOT_VAULT_PATH = ROOT;
const { RootVault: RV } = await import('./root_vault.mjs?aireg=' + Date.now());

console.log(C('\n=== AI REGISTRY + TIER GATING — SMOKE ===\n'));

const rec = new ReceiptLedger();
const reg = new AIRegistry({ receipts: rec });

// ── Register ─────────────────────────────────────────────────────────
const claude = reg.register({ agent_id: 'claude', display_name: 'Claude',
                                role: 'architect', tier: 'ELEVATED' });
assert('register returns ok + agent_id + namespace + capabilities',
  claude.ok && claude.agent_id === 'claude' && claude.namespace === 'ai/claude/' &&
  Array.isArray(claude.capabilities) && claude.capabilities.length > 0,
  `caps=${claude.capabilities?.length}`);

const chatgpt = reg.register({ agent_id: 'chatgpt-1', display_name: 'ChatGPT Agent 1',
                                role: 'drafter', tier: 'STANDARD' });
assert('different AI gets different namespace', chatgpt.namespace === 'ai/chatgpt-1/');

// ── Tier capability expansion ───────────────────────────────────────
assert('BASIC tier has read-only tools', AIRegistry.TIER_CAPABILITIES.BASIC.includes('vault_list'));
assert('STANDARD does NOT include runspace_*', !AIRegistry.TIER_CAPABILITIES.STANDARD.includes('runspace_exec_governed'));
assert('ELEVATED includes runspace_exec_governed', AIRegistry.TIER_CAPABILITIES.ELEVATED.includes('runspace_exec_governed'));

const claudeCaps = reg.get('claude').capabilities;
assert('ELEVATED Claude can call runspace_exec_governed', claudeCaps.includes('runspace_exec_governed'));
assert('ELEVATED Claude can call vault_store (inherited from STANDARD)', claudeCaps.includes('vault_store'));
assert('ELEVATED Claude can call vault_list (inherited from BASIC)', claudeCaps.includes('vault_list'));

const chatgptCaps = reg.get('chatgpt-1').capabilities;
assert('STANDARD ChatGPT can call vault_store', chatgptCaps.includes('vault_store'));
assert('STANDARD ChatGPT CANNOT call runspace_exec_governed', !chatgptCaps.includes('runspace_exec_governed'));
assert('STANDARD ChatGPT CANNOT call root_write', !chatgptCaps.includes('root_write'));

// ── permits() gating ────────────────────────────────────────────────
assert('permits(claude, runspace_exec_governed) === true',
  reg.permits('claude', 'runspace_exec_governed'));
assert('permits(chatgpt-1, runspace_exec_governed) === false',
  !reg.permits('chatgpt-1', 'runspace_exec_governed'));
assert('permits(unknown, vault_list) === false',
  !reg.permits('does-not-exist', 'vault_list'));

// Revoke
reg.revoke('chatgpt-1');
assert('revoked AI is denied all tools',
  !reg.permits('chatgpt-1', 'vault_list'),
  'status=' + reg.get('chatgpt-1').status);

// Restore for the gateway test below
reg.register({ agent_id: 'chatgpt-1', status: 'active' });

// ── Live gateway with tier gate ─────────────────────────────────────
const rv = new RV();
await rv.load();
const PORT = 8745 + Math.floor(Math.random() * 30);

const tools = {
  vault_list: { description: 'List vault entries.', inputSchema: { type:'object' },
    handler: async () => ({ ok: true, entries: [] }) },
  vault_store: { description: 'Store an entry.', inputSchema: { type:'object' },
    handler: async (a) => ({ ok: true, stored: a }) },
  runspace_exec_governed: { description: 'Execute code.', inputSchema: { type:'object' },
    handler: async () => ({ ok: true, exec: 'ran' }) },
};

const gw = new ApiGateway({ tools, rootVault: rv, receipts: rec, port: PORT, aiRegistry: reg });
await gw.start();
const base = `http://localhost:${PORT}`;

// Issue key for Claude (ELEVATED)
const claudeKey = issueApiKey({ rootVault: rv, name: 'claude', agent_id: 'claude', operator: 'Medin' });
// Issue key for ChatGPT (STANDARD)
const cgptKey = issueApiKey({ rootVault: rv, name: 'chatgpt-1', agent_id: 'chatgpt-1', operator: 'Medin' });
assert('both keys issued', claudeKey.ok && cgptKey.ok);

// /v1/me for Claude
const claudeMe = await fetch(base + '/v1/me', { headers: { Authorization: 'Bearer ' + claudeKey.key } }).then(r => r.json());
assert('/v1/me returns full AI record for ELEVATED Claude',
  claudeMe.ok && claudeMe.tier === 'ELEVATED' && claudeMe.role === 'architect',
  `tier=${claudeMe.tier} role=${claudeMe.role}`);

// /v1/tools filtered by tier
const claudeTools = await fetch(base + '/v1/tools', { headers: { Authorization: 'Bearer ' + claudeKey.key } }).then(r => r.json());
assert('ELEVATED Claude sees all 3 tools',
  claudeTools.ok && claudeTools.tools.length === 3,
  `count=${claudeTools.tools?.length}`);

const cgptTools = await fetch(base + '/v1/tools', { headers: { Authorization: 'Bearer ' + cgptKey.key } }).then(r => r.json());
assert('STANDARD ChatGPT does NOT see runspace_exec_governed',
  cgptTools.ok && cgptTools.tools.every(t => t.name !== 'runspace_exec_governed') &&
  cgptTools.tools.some(t => t.name === 'vault_store'),
  `tools=${cgptTools.tools?.map(t=>t.name).join(',')}`);

// Invoke a tool you SHOULD be allowed to use
const cgptStore = await fetch(base + '/v1/tools/vault_store', {
  method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + cgptKey.key },
  body: JSON.stringify({ key: 'note', value: 'hi' }),
}).then(r => r.json());
assert('STANDARD ChatGPT CAN call vault_store',
  cgptStore.ok && cgptStore.stored?.agent_id === 'chatgpt-1');

// Invoke a tool you should NOT be allowed to use
const cgptExec = await fetch(base + '/v1/tools/runspace_exec_governed', {
  method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + cgptKey.key },
  body: JSON.stringify({}),
}).then(r => r.json());
assert('STANDARD ChatGPT BLOCKED from runspace_exec_governed with TIER_INSUFFICIENT',
  !cgptExec.ok && cgptExec.reason === 'TIER_INSUFFICIENT' && cgptExec.tier === 'STANDARD',
  `reason=${cgptExec.reason} tier=${cgptExec.tier}`);

// Claude (ELEVATED) CAN call it
const claudeExec = await fetch(base + '/v1/tools/runspace_exec_governed', {
  method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + claudeKey.key },
  body: JSON.stringify({}),
}).then(r => r.json());
assert('ELEVATED Claude CAN call runspace_exec_governed',
  claudeExec.ok && claudeExec.exec === 'ran');

// /v1/protocol returns protocol docs from ROOT
rv.write({ key: 'protocol/welcome', kind: 'doctrine', agent_id: 'system', operator: 'Medin',
            value: 'Welcome to Loom. Be honest. Use tier-appropriate tools.' });
const protocols = await fetch(base + '/v1/protocol', { headers: { Authorization: 'Bearer ' + claudeKey.key } }).then(r => r.json());
assert('/v1/protocol returns protocol/* docs',
  protocols.ok && protocols.protocols.some(p => p.key === 'protocol/welcome'));

// Touch increments last_seen and call count
const beforeCalls = reg.get('claude').calls_total;
await fetch(base + '/v1/tools/vault_list', { method: 'POST', headers: { Authorization: 'Bearer ' + claudeKey.key }, body: '{}' });
const afterCalls = reg.get('claude').calls_total;
assert('touch increments calls_total', afterCalls > beforeCalls,
  `${beforeCalls} → ${afterCalls}`);

await gw.stop();
await fs.unlink(ROOT).catch(()=>{});

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  AI registry + tier gating online — TIER_INSUFFICIENT block verified, namespaced /v1/me, /v1/protocol live\n')));
