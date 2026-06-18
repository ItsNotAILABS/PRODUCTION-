// Smoke for deposits.mjs — encrypted at rest, agent-scoped retrieval.

import { DepositLedger } from './deposits.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { MedinaVault } from './vault.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

const TMP = join(tmpdir(), `loom-deposits-${Date.now()}`);
process.env.MEDINA_DEPOSITS_PATH = TMP;
const { DepositLedger: DL } = await import('./deposits.mjs?fresh=' + Date.now());

console.log(C('\n=== DEPOSITS — SMOKE ===\n'));

const rec = new ReceiptLedger();
const vault = new MedinaVault();
const dep = new DL({ receipts: rec, vault });

// Simulate a ChatGPT agent depositing a computational receipt
const payload = JSON.stringify({
  computation: 'matmul',
  dimensions: [1024, 1024],
  result_hash: 'abc123',
  ts: Date.now(),
  derived: { mean: 0.5, std: 0.1 },
});
const content_b64 = Buffer.from(payload, 'utf8').toString('base64');

const create = await dep.create({
  agent_id: 'chatgpt-custom-gpt',
  kind: 'computational_receipt',
  label: 'matmul-1024x1024',
  content_b64,
  metadata: { source: 'gpt-4-turbo', confidence: 'high' },
});
assert('create returns deposit_id + fingerprint + bytes',
  create.ok && create.deposit_id?.startsWith('dep_') &&
  /^[a-f0-9]{64}$/.test(create.fingerprint) &&
  create.bytes === Buffer.byteLength(payload, 'utf8'),
  `id=${create.deposit_id} fp=${create.fingerprint?.slice(0,16)} raw=${create.bytes} enc=${create.encrypted_bytes}`);

// File actually written to disk
const stat = await fs.stat(create.stored_at);
assert('encrypted file written to disk', stat.size > 0);

// Receipt fired by system
assert('deposit fires token_mint receipt as system',
  rec.list({ kind: 'token_mint' }).some(r => r.ref === `deposit:${create.deposit_id}` && r.agent === 'system'));

// Operator index visible in vault under ai/<agent>/deposits/<id>
assert('operator vault has index entry under ai/<agent>/deposits/<id>',
  vault.entries.has(`ai/chatgpt-custom-gpt/deposits/${create.deposit_id}`));

// Indexed entry does NOT contain plaintext payload (label is intentionally visible).
const indexEntry = vault.entries.get(`ai/chatgpt-custom-gpt/deposits/${create.deposit_id}`);
const indexStr = JSON.stringify(indexEntry.value);
assert('vault index does NOT contain payload plaintext (result_hash / derived / 1024)',
  !indexStr.includes('result_hash') && !indexStr.includes('derived') && !indexStr.includes('abc123'),
  'preview=' + indexStr.slice(0, 120));

// Owning agent CAN retrieve and decrypt
const own = await dep.get({ deposit_id: create.deposit_id, agent_id: 'chatgpt-custom-gpt' });
assert('owning agent retrieves + decrypts to original plaintext',
  own.ok && Buffer.from(own.content_b64, 'base64').toString('utf8') === payload,
  `match=${Buffer.from(own.content_b64, 'base64').toString('utf8') === payload}`);

// Other agent BLOCKED
const other = await dep.get({ deposit_id: create.deposit_id, agent_id: 'some-other-ai' });
assert('different agent_id BLOCKED with WRONG_AGENT',
  !other.ok && other.reason === 'WRONG_AGENT' && other.owner === 'chatgpt-custom-gpt',
  `reason=${other.reason} owner=${other.owner}`);

// System CAN retrieve (for replication / migration)
const sys = await dep.get({ deposit_id: create.deposit_id, agent_id: 'system' });
assert('system can decrypt for replication', sys.ok);

// Operator (no agent_id provided) — the get without agent_id allows it (system path)
// but a real operator call would pass their operator id; let's test that scenario
const operator = await dep.get({ deposit_id: create.deposit_id, agent_id: 'Medin' });
assert('operator agent_id is NOT the owner → BLOCKED', !operator.ok && operator.reason === 'WRONG_AGENT');

// Tampered ciphertext detected by GCM auth tag
const bundle = await fs.readFile(create.stored_at);
const tampered = Buffer.from(bundle);
tampered[60] ^= 0xff; // flip one byte in ciphertext
await fs.writeFile(create.stored_at, tampered);
const corrupted = await dep.get({ deposit_id: create.deposit_id, agent_id: 'chatgpt-custom-gpt' });
assert('tampered ciphertext returns TAMPERED_OR_KEY_MISMATCH (GCM auth tag fails)',
  !corrupted.ok && corrupted.reason === 'TAMPERED_OR_KEY_MISMATCH');

// Restore for round-trip test
await fs.writeFile(create.stored_at, bundle);

// Invalid kind
const badKind = await dep.create({ agent_id: 'x', kind: 'nonsense', content_b64: 'aGVsbG8=' });
assert('invalid kind rejected with allowed list',
  !badKind.ok && badKind.reason === 'INVALID_KIND' && Array.isArray(badKind.allowed));

// Empty content rejected
const empty = await dep.create({ agent_id: 'x' });
assert('missing content_b64 rejected', !empty.ok && empty.reason === 'CONTENT_REQUIRED');

// List + stats — manifest is allowed to contain user-set label, NEVER payload internals.
const list = dep.list({ agent_id: 'chatgpt-custom-gpt' });
assert('list returns manifests (no payload plaintext — no result_hash / derived)',
  list.length >= 1 &&
  !JSON.stringify(list[0]).includes('result_hash') &&
  !JSON.stringify(list[0]).includes('derived') &&
  !JSON.stringify(list[0]).includes('content_b64'),
  `count=${list.length}`);

const stats = dep.stats();
assert('stats report by_agent + by_kind + bytes totals',
  stats.total >= 1 && stats.by_agent['chatgpt-custom-gpt'] >= 1 &&
  stats.by_kind.computational_receipt >= 1 &&
  stats.raw_bytes_total > 0,
  JSON.stringify({total: stats.total, agent: stats.by_agent}));

// Persistence round-trip
const meta = dep.toMeta();
const dep2 = new DL({});
dep2.loadFromMeta(meta);
assert('deposit ledger survives meta round-trip',
  dep2.manifests.size === dep.manifests.size);

// Multi-tenant separation — second agent's deposits don't appear under first
await dep.create({
  agent_id: 'claude',
  kind: 'json_payload',
  label: 'reasoning-trace',
  content_b64: Buffer.from('{"trace":"private claude data"}').toString('base64'),
});
const cgptOnly = dep.list({ agent_id: 'chatgpt-custom-gpt' });
const claudeOnly = dep.list({ agent_id: 'claude' });
assert('list by agent_id only returns that agent\'s deposits',
  cgptOnly.every(d => d.agent_id === 'chatgpt-custom-gpt') &&
  claudeOnly.every(d => d.agent_id === 'claude') &&
  cgptOnly.length >= 1 && claudeOnly.length >= 1);

// Cleanup
try { await fs.rm(TMP, { recursive: true, force: true }); } catch {}

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Deposits online · AES-256-GCM at rest · agent-scoped retrieval · tampering detected · operator denied plaintext\n')));
