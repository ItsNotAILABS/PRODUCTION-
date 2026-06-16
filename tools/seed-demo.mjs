#!/usr/bin/env node
// seed-demo.mjs — populate ~/.medina/vault.json + signal.json with realistic
// sample data so the dashboard shows what the mesh looks like in flight.
// Safe: writes into MEDINA_HOME (default ~/.medina). Backs up existing files.

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const MEDINA_HOME = process.env.MEDINA_HOME ?? join(homedir(), '.medina');
const VAULT_PATH  = process.env.MEDINA_VAULT_PATH  ?? join(MEDINA_HOME, 'vault.json');
const SIGNAL_PATH = process.env.MEDINA_SIGNAL_PATH ?? join(MEDINA_HOME, 'signal.json');
const OPERATOR    = process.env.MEDINA_OPERATOR_ID ?? process.env.USERNAME ?? 'operator';
const EMPTY = '0'.repeat(64);

function h(e) { return createHash('sha256').update(JSON.stringify(e)).digest('hex'); }

async function backup(p) {
  try { await fs.access(p);
    const bak = p + '.medina-bak';
    try { await fs.access(bak); } catch { await fs.copyFile(p, bak); }
  } catch {}
}

async function writeJson(p, obj) {
  await fs.mkdir(dirname(p), { recursive: true });
  await backup(p);
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function entry(key, value, tier, owner, ageHours = 1, lineageDepth = 1) {
  const created = Date.now() - ageHours * 3_600_000;
  const ttl = { PUBLIC: 24, SHARED: 168, PRIVATE: 720, SOVEREIGN: Infinity }[tier];
  const decay = { PUBLIC: 0.05, SHARED: 0.02, PRIVATE: 0.01, SOVEREIGN: 0 }[tier];
  const lineage = Array.from({ length: lineageDepth }, (_, i) => i === 0 ? EMPTY : h({i}));
  return [key, {
    key, value, tier, ownerId: owner, sharedWith: [],
    ttlMs: ttl === Infinity ? Infinity : ttl * 3_600_000,
    createdAt: created,
    expiresAt: ttl === Infinity ? Infinity : created + ttl * 3_600_000,
    decayRate: decay, metadata: {}, lineage,
  }];
}

const vault = {
  protocol: 'MEDINA-PROTOCOL/0.1',
  entries: [
    entry('operator/preferences/style',
          'concise, no preamble, no fluff. show diffs not summaries.',
          'SOVEREIGN', OPERATOR, 240, 3),
    entry('operator/preferences/timezone', 'America/Chicago', 'SOVEREIGN', OPERATOR, 720, 1),
    entry('project/north-star',
          'distribute MEDINA-PROTOCOL/0.1 — free local node first, paid depth after',
          'PRIVATE', OPERATOR, 12, 4),
    entry('project/current-sprint',
          { week: 1, focus: 'ship vault + dashboard + business plan', status: 'in-flight' },
          'PRIVATE', OPERATOR, 2, 2),
    entry('session/2026-06-15/handoff',
          'claude shipped vault; cursor working on UI polish; next: install demo',
          'SHARED', 'claude', 3, 1),
    entry('session/2026-06-15/decisions',
          ['fibonacci pricing', 'dashboard at 8731', 'cmd installer for windows'],
          'SHARED', 'claude', 1, 1),
    entry('cache/last-build', { sha: 'e22c40d9', gates: '3/3 green' },
          'PUBLIC', 'claude', 0.5, 1),
    entry('cache/dashboard-port', 8731, 'PUBLIC', 'claude', 0.1, 1),
  ],
};

const now = Date.now();
const sig = (mins, type, from, to, subject, payload, priority='NORMAL') => ({
  id: `sig_demo_${mins}_${Math.random().toString(36).slice(2,8)}`,
  type, from, to, subject, payload, priority, read_by: [],
  ts: new Date(now - mins * 60_000).toISOString(),
});

const signal = {
  protocol: 'MEDINA-PROTOCOL/0.1',
  roles: [['claude','LEAD'], ['cursor','CRITIC'], ['cline','BUILDER']],
  signals: [
    sig(180, 'BROADCAST', 'claude', null, 'session:start',  'beginning ship-day'),
    sig(120, 'DIRECT',    'claude', 'cursor', 'context:share', { task: 'ship vault', file: 'server.mjs' }),
    sig(95,  'ROLE',      'claude', 'CRITIC', 'review:needed', 'pricing tiers ok?', 'HIGH'),
    sig(60,  'BROADCAST', 'cursor', null, 'review:complete', 'looks good — ship it'),
    sig(45,  'DIRECT',    'cline',  'claude', 'build:status',  { ok: true, gates: '3/3' }),
    sig(15,  'URGENT',    'claude', null, 'mesh:dashboard-live', 'open http://localhost:8731', 'CRITICAL'),
    sig(2,   'BROADCAST', 'claude', null, 'demo:seeded', 'dashboard now showing real-shape data'),
  ],
};

await writeJson(VAULT_PATH, vault);
await writeJson(SIGNAL_PATH, signal);

console.log('seeded:');
console.log('  vault  ', VAULT_PATH, `(${vault.entries.length} entries)`);
console.log('  signal ', SIGNAL_PATH, `(${signal.signals.length} signals · ${signal.roles.length} agents)`);
console.log('\nOpen the dashboard: http://localhost:8731');
console.log('Backups saved as <path>.medina-bak (first time only).');
