// Smoke for AI workspace: workspace, plans, context, consolidation, reinforcement.

import { Workspace }         from './workspace.mjs';
import { PlanLedger }        from './plans.mjs';
import { ContextLog }        from './context.mjs';
import { Reinforcement }     from './reinforcement.mjs';
import { MemoryConsolidator } from './consolidation.mjs';
import { MedinaVault }       from './vault.mjs';
import { ReceiptLedger }     from './receipts.mjs';
import { SessionGraph }      from './graph.mjs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d = '') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d ? '  ' + Y('· ' + d) : ''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== AI WORKSPACE — SMOKE ===\n'));

// ── Workspace: focus slots + scratchpad + LRU eviction + reinforcement ──
const ws = new Workspace();
for (let i = 0; i < 8; i++) ws.focus('claude', `slot_${i}`, `v${i}`);
const view = ws.view('claude');
assert('focus slots cap at 7 (Miller 7±2); coldest evicted',
  view.focus.length === 7 && !view.focus.find(f => f.key === 'slot_0'),
  view.focus.map(f => f.key).join(','));

ws.focus('claude', 'slot_3', 'updated'); // re-touch slot_3
const view2 = ws.view('claude');
const slot3 = view2.focus.find(f => f.key === 'slot_3');
assert('re-touch resets confidence to 1.0 and moves to most-recent',
  slot3?.confidence === 1.0 && view2.focus[view2.focus.length - 1].key === 'slot_3',
  `last=${view2.focus[view2.focus.length - 1].key}`);

ws.scratch('claude', 'note1', { thought: 'maybe consolidate the legal artifacts' }, { ttl: 60_000 });
const r1 = ws.readScratch('claude', 'note1');
const r2 = ws.readScratch('claude', 'note1');
assert('scratchpad becomes eligible after 2 reads', r2.ok && r2.eligible === true, `eligible=${r2.eligible}`);

const promotable = ws.promotable('claude');
assert('promotable returns note1', promotable.length === 1 && promotable[0].key === 'note1');

ws.scratch('claude', 'expiring', { x: 1 }, { ttl: -1 }); // already expired
const expired = ws.readScratch('claude', 'expiring');
assert('reading expired scratchpad returns EXPIRED + auto-cleans',
  !expired.ok && expired.reason === 'EXPIRED', expired.reason);

const meta = ws.toMeta();
const ws2 = new Workspace();
ws2.loadFromMeta(meta);
assert('workspace round-trips through meta',
  ws2.view('claude').focus.length === 7 && ws2.view('claude').scratchpad.length >= 1,
  `focus=${ws2.view('claude').focus.length} scratch=${ws2.view('claude').scratchpad.length}`);

// ── Plans: create, advance, next_actions, status roll-up ──────────────
const pl = new PlanLedger();
const plan = pl.create({
  title: 'Ship workspace layer',
  why: 'AI continuity across sessions',
  steps: [
    { title: 'write workspace.mjs',       intended_skill: 'code.commit_message' },
    { title: 'wire MCP tools',            intended_skill: 'code.changelog' },
    { title: 'add dashboard tab',         intended_workflow: 'data_cleanup_report' },
  ],
});
assert('plan_create returns plan with 3 todo steps',
  plan.ok && plan.plan.steps.length === 3 && plan.plan.steps.every(s => s.status === 'todo'),
  `id=${plan.plan?.id}`);

pl.advance(plan.plan.id, 0, { status: 'done', log: 'committed' });
pl.advance(plan.plan.id, 1, { status: 'doing' });
const next = pl.nextActions();
assert('next_actions returns the doing step (not the done one)',
  next.length === 1 && next[0].step_id === 1, JSON.stringify(next[0]));

pl.advance(plan.plan.id, 1, { status: 'done' });
pl.advance(plan.plan.id, 2, { status: 'done' });
const status = pl.list()[0].steps_done;
assert('plan rolls up to done when all steps done', pl.list()[0].steps_done === 3 && pl.get(plan.plan.id).plan.status === 'done',
  pl.get(plan.plan.id).plan.status);

const badAdvance = pl.advance(plan.plan.id, 0, { status: 'WAT' });
assert('plan rejects invalid status with allowed list',
  !badAdvance.ok && badAdvance.reason === 'INVALID_STATUS', badAdvance.reason);

// ── Context: snapshot + open returns prior context ────────────────────
const cl = new ContextLog();
cl.snapshot({
  session_id: 'sess_a', agent: 'claude',
  summary: 'Built workspace layer; 5 modules online.',
  focus: [{ key: 'workspace_focus_slots' }, { key: 'plan_create' }],
  active_plans: [{ id: 'plan_xyz', title: 'Ship workspace' }],
  open_promises: ['add dashboard tab'],
  decisions: ['rename Medina Mesh → Medina'],
});
const opened = cl.open({ session_id: 'sess_b', agent: 'claude' });
assert('session_open returns the prior snapshot for resume',
  opened.ok && opened.summary.includes('5 modules online') &&
  opened.active_plans.length === 1 && opened.open_promises.length === 1,
  JSON.stringify({ resumed_from: opened.resumed_from, summary: opened.summary?.slice(0,40) }));

const fresh = new ContextLog();
const noPrior = fresh.open({ session_id: 'sess_first' });
assert('session_open with no prior returns null summary',
  noPrior.ok && noPrior.summary === null && noPrior.resumed_from === null,
  `resumed_from=${noPrior.resumed_from}`);

// ── Reinforcement: φ-decay + reset on reinforce ───────────────────────
const re = new Reinforcement();
re.reinforce('foo');
const init = re.describe('foo');
assert('initial confidence is 1.0', init.confidence === 1.0);

// Force quiet time → beat → confidence × 0.382
re.records.get('foo').lastSeen = Date.now() - 120_000;
re.beat();
const decayed = re.describe('foo');
assert('after one beat, confidence ≈ 0.382 (1 - 1/φ)',
  Math.abs(decayed.confidence - 0.382) < 0.005, `confidence=${decayed.confidence.toFixed(4)}`);

re.reinforce('foo');
assert('reinforce resets confidence to 1.0', re.describe('foo').confidence === 1.0);

// Run many beats until stale
re.records.get('foo').lastSeen = Date.now() - 120_000;
for (let i = 0; i < 10; i++) {
  re.beat();
  re.records.get('foo').lastSeen = Date.now() - 120_000;
}
assert('after many beats, entry marked stale (< 0.05)',
  re.describe('foo').stale && re.describe('foo').confidence < 0.05,
  `confidence=${re.describe('foo').confidence.toExponential(2)} stale=${re.describe('foo').stale}`);

// ── Consolidation: cluster cold entries → 1 summary ───────────────────
const vault = new MedinaVault();
const rec = new ReceiptLedger();
const g = new SessionGraph();
const con = new MemoryConsolidator({ vault, receipts: rec, graph: g });

for (let i = 0; i < 4; i++) {
  vault.store({ key: `legal/draft_${i}`, value: { text: `draft ${i}` },
                tier: 'PRIVATE', ownerId: 'claude',
                metadata: { tags: ['legal'] } });
}
const v0 = vault.entries.get('legal/draft_0');
// Force the entries cold
for (let i = 0; i < 4; i++) {
  const e = vault.entries.get(`legal/draft_${i}`);
  if (e) { e.createdAt -= 60 * 60 * 1000 * 200; } // 200h old → strength very low
}
const cands = con.candidates({ ownerId: 'claude' });
assert('consolidation candidates finds the cold legal cluster (≥3 members)',
  cands.ok && cands.clusters.some(c => c.prefix === 'legal' && c.count >= 3),
  JSON.stringify(cands.clusters.map(c => `${c.prefix}:${c.count}`)));

const run = con.consolidate({ ownerId: 'claude', prefix: 'legal',
                              summary: '4 draft legal artifacts produced during workspace build; superseded by the workflow.' });
assert('consolidate produces a summary entry under consolidated/<prefix>/',
  run.ok && run.key.startsWith('consolidated/legal/') && run.source_count >= 3,
  `key=${run.key} count=${run.source_count}`);

const recStats = rec.stats();
assert('consolidation fires a vault_promote receipt',
  recStats.by_kind?.vault_promote === 1, JSON.stringify(recStats.by_kind));

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Workspace layer online — focus, scratchpad, plans, context resume, φ-decay reinforcement, consolidation\n')));
