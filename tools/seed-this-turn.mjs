#!/usr/bin/env node
// Seed the live vault with REAL state from THIS turn — the plan I executed,
// the workspace focus I had, the context snapshot I'd hand to my next session.
// Not fake demo data. This is what actually happened in this session.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { promises as fs } from 'node:fs';
import { MedinaVault } from '../products/medina-vault/src/vault.mjs';
import { loadSnapshot, saveSnapshot, defaultVaultPath } from '../products/medina-vault/src/snapshot.mjs';
import { Workspace }     from '../products/medina-vault/src/workspace.mjs';
import { PlanLedger }    from '../products/medina-vault/src/plans.mjs';
import { ContextLog }    from '../products/medina-vault/src/context.mjs';
import { Reinforcement } from '../products/medina-vault/src/reinforcement.mjs';
import { TokenLedger }   from '../products/medina-vault/src/tokens.mjs';
import { KeyVault }      from '../products/medina-vault/src/keys.mjs';
import { SessionGraph }  from '../products/medina-vault/src/graph.mjs';
import { KnowledgeLedger } from '../products/medina-vault/src/knowledge_tokens.mjs';
import { ReceiptLedger } from '../products/medina-vault/src/receipts.mjs';
import { SkillSandbox }  from '../products/medina-vault/src/sandbox.mjs';

const path = defaultVaultPath();
const existing = await loadSnapshot(path).catch(() => null);
const vault = new MedinaVault();
if (existing) vault.loadFromJSON(existing);

const tokens = new TokenLedger();   tokens.loadFromMeta(existing?._meta);
const keys   = new KeyVault();      keys.loadFromMeta(existing?._meta);
const graph  = new SessionGraph();  graph.loadFromMeta(existing?._meta);
const know   = new KnowledgeLedger(); know.loadFromMeta(existing?._meta);
const rec    = new ReceiptLedger(); rec.loadFromMeta(existing?._meta);
const ws     = new Workspace();     ws.loadFromMeta(existing?._meta);
const plans  = new PlanLedger();    plans.loadFromMeta(existing?._meta);
const ctx    = new ContextLog();    ctx.loadFromMeta(existing?._meta);
const reinf  = new Reinforcement(); reinf.loadFromMeta(existing?._meta);
const sb     = new SkillSandbox({ registry: { skills: new Map(), register(){return {ok:true}} }, runner: { run: async () => ({ ok: true }) } });
sb.loadFromMeta(existing?._meta);

// ── Real focus slots from this turn ──────────────────────────────────
ws.focus('claude', 'building/workspace_layer', 'workspace.mjs · 7-slot LRU with reinforcement reset');
ws.focus('claude', 'building/plans',           'plans.mjs · multi-session plans with status rollup');
ws.focus('claude', 'building/context',         'context.mjs · session lifecycle with snapshot resume');
ws.focus('claude', 'building/consolidation',   'consolidation.mjs · episodic → semantic via MMS pattern #1');
ws.focus('claude', 'building/reinforcement',   'reinforcement.mjs · φ-decay confidence per entry');
ws.focus('claude', 'rename/medina_mesh',       'Medina Mesh → Medina; dashboard h1 simplified');
ws.focus('claude', 'dashboard/new_tabs',       'Workspace + Plans tabs added to sidebar');

// ── Real scratchpad notes ─────────────────────────────────────────────
ws.scratch('claude', 'mms_pattern_3_lineage_fork',
  '3-way merge with conflict report would let me branch from a prior decision and rejoin cleanly. Defer to next turn.',
  { ttl: 24 * 60 * 60 * 1000 });
ws.scratch('claude', 'mms_pattern_5_temple_coords',
  'Memory Temple coords (theta/phi/depth/ring/beat) — would enable replay routes. Big idea; not this turn.',
  { ttl: 24 * 60 * 60 * 1000 });
ws.scratch('claude', 'next_integrations',
  'After GitHub: SMTP (send NDAs by email), Notion (drop artifacts into a workspace), Stripe (invoice → charge link).',
  { ttl: 7 * 24 * 60 * 60 * 1000 });

// ── Real plan that captures the actual sequence of this turn ─────────
const planResult = plans.create({
  title: 'AI Workspace Layer · build & ship',
  why: "Operator asked for what I (Claude) would want as an AI in this vault, plus a rename and the MedinaMemorySystems patterns folded in.",
  owner: 'claude',
  steps: [
    { title: 'Read MedinaMemorySystems via Explore agent for pattern extraction', notes: 'Got 10 patterns; picked #1 (consolidation) and #4 (φ-decay confidence) as new builds.' },
    { title: 'Build workspace.mjs (focus + scratchpad)',           intended_skill: 'memory.recall_by_tag' },
    { title: 'Build plans.mjs (multi-session plans)',              intended_skill: 'comms.status_update' },
    { title: 'Build context.mjs (session lifecycle)' },
    { title: 'Build consolidation.mjs (MMS pattern #1)' },
    { title: 'Build reinforcement.mjs (MMS pattern #4)' },
    { title: 'Wire 22 new MCP tools across 5 modules' },
    { title: 'Rename Medina Mesh → Medina' },
    { title: 'Add Workspace + Plans dashboard tabs' },
    { title: 'Smoke + ship-all green' },
    { title: 'Seed live vault with real state from this turn' },
  ],
});
// Mark first 10 done (all but the seeding step which is happening right now)
for (let i = 0; i < 10; i++) plans.advance(planResult.plan.id, i, { status: 'done' });
plans.advance(planResult.plan.id, 10, { status: 'doing', log: 'running seed-this-turn.mjs now' });

// ── Real context snapshot for the next session to pick up ────────────
ctx.snapshot({
  session_id: graph.session.id,
  agent: 'claude',
  summary:
    'Built the AI workspace layer: 5 modules (workspace, plans, context, consolidation, reinforcement) ' +
    '+ 22 new MCP tools + 2 new dashboard tabs + rename Medina Mesh → Medina. ' +
    'SHIP_ALL · 145 PASS / 0 FAIL across 5 vault smoke suites. ' +
    "What's next: more integrations (SMTP/Notion/Stripe), MMS pattern #3 (lineage fork/merge), pattern #5 (temple coordinates), pattern #7 (4-level compression tiers).",
  focus: ws.view('claude').focus.map(f => ({ key: f.key })),
  active_plans: [{ id: planResult.plan.id, title: planResult.plan.title }],
  open_promises: [
    'Add SMTP integration so generated NDAs can be sent',
    'Surface knowledge tokens in the Workspace tab once one is minted',
    'Wire reinforcement.beat() into the dashboard heartbeat (873ms)',
  ],
  decisions: [
    'App name: Medina (dropped Mesh suffix)',
    'Subtitle: AI memory · skills · continuity',
    'Tabs order: Workspace · Plans first (operator-facing AI work surface)',
    'Adopted MMS pattern #1 (consolidation) and #4 (φ-decay confidence)',
  ],
});

// ── Mint one real knowledge token from this session ─────────────────
const mintRes = know.mint({
  name: 'workspace_layer_doctrine_v1',
  minter: 'claude',
  domains: ['memory','continuity','tokenomics','ai-workspace'],
  summary:
    'An AI working in a persistent vault needs FIVE things beyond memory: ' +
    '(1) a bounded focus buffer (Miller 7±2) that decays under φ; ' +
    '(2) multi-session plans with status rollup so I pick up where I left off; ' +
    '(3) session-boundary snapshots so context loss does not erase progress; ' +
    '(4) consolidation to fold N episodic entries into 1 semantic summary; ' +
    '(5) per-entry confidence with reinforcement-on-validation. ' +
    'These five compose continuity — the AI working in here next time is the same AI.',
  inputs: [
    { kind: 'entry', ref: 'building/workspace_layer' },
    { kind: 'entry', ref: 'building/plans' },
    { kind: 'entry', ref: 'building/context' },
    { kind: 'entry', ref: 'building/consolidation' },
    { kind: 'entry', ref: 'building/reinforcement' },
  ],
});
if (mintRes.ok) {
  graph.addNode({ id: mintRes.token.id, kind: 'token', label: mintRes.token.name, domains: mintRes.token.domains });
  graph.link(graph.session.id, mintRes.token.id, 'minted');
  rec.append({ kind: 'token_mint', ref: mintRes.token.id, agent: 'claude',
               meta: { name: mintRes.token.name, input_count: mintRes.token.inputs.length } });
}

// ── Persist ──────────────────────────────────────────────────────────
const snap = vault.toJSON();
snap._meta = {
  ...(existing?._meta || {}),
  ...tokens.toMeta(),
  ...keys.toMeta(),
  ...graph.toMeta(),
  ...know.toMeta(),
  ...sb.toMeta(),
  ...rec.toMeta(),
  ...ws.toMeta(),
  ...plans.toMeta(),
  ...ctx.toMeta(),
  ...reinf.toMeta(),
  custos: { online: true, last_persist: Date.now() },
};
await saveSnapshot(path, snap);

console.log('seed-this-turn · wrote real state to ' + path);
console.log('  · plan:           ' + planResult.plan.id);
console.log('  · knowledge token: ' + (mintRes.ok ? mintRes.token.id : 'failed: ' + mintRes.reason));
console.log('  · context snapshot: ' + ctx.latest({ agent: 'claude' }).hash);
console.log('  · focus slots:     ' + ws.view('claude').focus.length);
console.log('  · scratchpad:      ' + ws.view('claude').scratchpad.length);
console.log('  · receipts:        ' + rec.receipts.length);
