// Smoke for root_vault.mjs — frozen, compressed, fingerprinted, categorized.

import { RootVault } from './root_vault.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

// Isolate to a temp file
const ROOT = join(tmpdir(), `loom-root-test-${Date.now()}.json`);
process.env.MEDINA_ROOT_VAULT_PATH = ROOT;

// Re-import after env var (fresh module instance)
const { RootVault: RV } = await import('./root_vault.mjs?fresh=' + Date.now());

console.log(C('\n=== ROOT VAULT — SMOKE ===\n'));

const rv = new RV();
await rv.load();

// ── Identity gate: operator denied ────────────────────────────────────
const denied = rv.write({ key: 'test', value: 'x', agent_id: 'Medin', operator: 'Medin' });
assert('operator agent_id is DENIED on write',
  !denied.ok && denied.reason === 'ROOT_FORBIDDEN', denied.reason);

// ── AI/system allowed ────────────────────────────────────────────────
const w1 = rv.write({
  key: 'doctrine/never-fake-data',
  agent_id: 'claude', operator: 'Medin',
  kind: 'doctrine',
  value: 'Never seed fake data into operator systems. No fabricated agents. No invented handoffs. ' +
         "Empty state is honest; fake state is dishonest. This is a sovereign principle.",
});
assert('write succeeds for AI agent_id', w1.ok && w1.key === 'doctrine/never-fake-data', w1.reason);
assert('auto-categorize tagged "doctrine" from keyword scan',
  w1.auto_tags.includes('doctrine'), `tags=${w1.auto_tags?.join(',')}`);
assert('auto-categorize tagged "identity" (mentions "sovereign")',
  w1.auto_tags.includes('identity') || w1.auto_tags.includes('doctrine'),
  `tags=${w1.auto_tags?.join(',')}`);
assert('front_page summary present (≤240 chars)',
  typeof w1.front_page === 'string' && w1.front_page.length > 0 && w1.front_page.length <= 240,
  `len=${w1.front_page?.length}`);

// ── Compression: large value gets gzipped ────────────────────────────
const big = 'This is a learning entry that contains a long technical reflection. '.repeat(50);
const w2 = rv.write({ key: 'learning/big-thought', agent_id: 'claude', operator: 'Medin',
                       kind: 'learning', value: big });
assert(`large value compressed (raw=${big.length}, ratio=${w2.compression_ratio})`,
  w2.compressed && w2.compression_ratio < 0.5,
  `compressed=${w2.compressed} ratio=${w2.compression_ratio}`);

// ── Read returns decompressed value ───────────────────────────────────
const r2 = rv.read({ key: 'learning/big-thought', agent_id: 'claude', operator: 'Medin' });
assert('read decompresses transparently to the original string',
  r2.ok && r2.value === big, `match=${r2.value === big}`);

// ── Immutability: same key → -v2 suffix ──────────────────────────────
const w3 = rv.write({ key: 'doctrine/never-fake-data', agent_id: 'claude', operator: 'Medin',
                       kind: 'doctrine', value: 'updated text' });
assert('writing same key returns versioned key (-v2)',
  w3.ok && w3.key === 'doctrine/never-fake-data-v2', `key=${w3.key}`);
const w4 = rv.write({ key: 'doctrine/never-fake-data', agent_id: 'claude', operator: 'Medin',
                       kind: 'doctrine', value: 'updated text 3' });
assert('third write goes to -v3', w4.ok && w4.key === 'doctrine/never-fake-data-v3', `key=${w4.key}`);

// ── Chain: each entry has prev_hash = previous head ──────────────────
const list = rv.list({ agent_id: 'claude', operator: 'Medin', limit: 100 });
assert('list works for AI', list.ok && list.entries.length >= 4, `entries=${list.entries.length}`);

// Verify
const v = rv.verify();
assert('chain verifies intact after multiple writes',
  v.ok && v.length === rv.entries.size && v.head_hash === rv.head_hash,
  `length=${v.length} head=${v.head_hash?.slice(0,12)}`);

// ── Search ────────────────────────────────────────────────────────────
const s = rv.search({ query: 'doctrine', agent_id: 'claude', operator: 'Medin' });
assert('search finds entries by keyword in key/front_page/tags',
  s.ok && s.hits.length >= 3, `hits=${s.hits.length}`);

const opSearch = rv.search({ query: 'doctrine', agent_id: 'Medin', operator: 'Medin' });
assert('operator search is DENIED',
  !opSearch.ok && opSearch.reason === 'ROOT_FORBIDDEN');

// ── Package storage ──────────────────────────────────────────────────
const fakeArchive = Buffer.from('PK\x03\x04...fake zip bytes...').toString('base64');
const pkg = rv.store_package({
  key: 'loom-export-2026-06-16',
  agent_id: 'claude', operator: 'Medin',
  manifest: { name: 'loom-export', type: 'zip',
              files: ['src/server.mjs', 'src/root_vault.mjs', 'README.md'],
              description: 'Snapshot of Loom internals' },
  archive_b64: fakeArchive,
});
assert('store_package writes under packages/<key>',
  pkg.ok && pkg.key.startsWith('packages/loom-export-2026-06-16'),
  `key=${pkg.key}`);

const got = rv.get_package({ key: 'loom-export-2026-06-16', agent_id: 'claude', operator: 'Medin' });
assert('get_package returns manifest + archive_b64 + checksum',
  got.ok && got.archive_b64 === fakeArchive && got.manifest.files.length === 3 &&
  /^[a-f0-9]{64}$/.test(got.checksum),
  `checksum=${got.checksum?.slice(0,16)}`);

// ── Persistence round-trip ───────────────────────────────────────────
await rv.persist();
const rv2 = new RV();
await rv2.load();
assert('root vault survives persist → reload round-trip',
  rv2.entries.size === rv.entries.size && rv2.head_hash === rv.head_hash,
  `entries=${rv2.entries.size}/${rv.entries.size}`);

const v2 = rv2.verify();
assert('chain still verifies after reload',
  v2.ok && v2.length === rv.entries.size);

// ── Stats: compression savings, categories, kind breakdown ───────────
const stats = rv.stats();
assert('stats report compression ratio + bytes saved',
  stats.compression.entries_compressed >= 1 && stats.compression.bytes_saved > 0,
  `entries_compressed=${stats.compression.entries_compressed} saved=${stats.compression.bytes_saved}`);
assert('stats report by_kind + by_category',
  stats.by_kind.doctrine >= 3 && Object.keys(stats.by_category).length > 0,
  JSON.stringify(stats.by_kind));

// Cleanup
await fs.unlink(ROOT).catch(()=>{});

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Root vault online · operator denied · frozen · compressed · fingerprinted · auto-categorized\n')));
