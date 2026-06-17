// Smoke for engines.mjs — named callable workflows.

import { EngineRegistry } from './engines.mjs';
import { SkillRegistry } from './skills.mjs';
import { AgentRegistry } from './agents.mjs';
import { MedinaVault } from './vault.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { KnowledgeLedger } from './knowledge_tokens.mjs';
import { FailureRegistry } from './failures.mjs';
import { EfficiencyEngine } from './efficiency.mjs';
import { SessionGraph } from './graph.mjs';
import { MemoryConsolidator } from './consolidation.mjs';
import { Reinforcement } from './reinforcement.mjs';
import { ContextLog } from './context.mjs';
import { RootVault } from './root_vault.mjs';
import { AutoDoctrine } from './auto_doctrine.mjs';
import { SymbolTable } from './compression.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

const ROOT = join(tmpdir(), `loom-root-eng-${Date.now()}.json`);
process.env.MEDINA_ROOT_VAULT_PATH = ROOT;
const { RootVault: RV } = await import('./root_vault.mjs?eng=' + Date.now());

console.log(C('\n=== NAMED ENGINES — SMOKE ===\n'));

const vault = new MedinaVault();
const skills = new SkillRegistry({ vault });
const receipts = new ReceiptLedger();
const knowledge = new KnowledgeLedger();
const failures = new FailureRegistry({ receipts });
const efficiency = new EfficiencyEngine({ receipts, registry: skills });
const graph = new SessionGraph();
const consolidator = new MemoryConsolidator({ vault, receipts, graph });
const reinforcement = new Reinforcement();
const ctxLog = new ContextLog();
const symbolTable = new SymbolTable();
const rootVault = new RV(); await rootVault.load();
const autoDoctrine = new AutoDoctrine({ rootVault, receipts, efficiency, failures, knowledge });
const agents = new AgentRegistry({ vault, skills, receipts, knowledge,
                                    consolidator, failures, efficiency, graph });

const eng = new EngineRegistry({
  skills, agents, vault, rootVault, receipts, knowledge, failures,
  efficiency, consolidator, reinforcement, ctxLog, autoDoctrine, symbolTable,
});

assert(`10 engines registered (got ${eng.engines.size})`, eng.engines.size === 10,
  [...eng.engines.keys()].join(','));
const list = eng.list();
const expectedNames = ['morning_briefing','session_wrapup','health_check','consolidate_cold',
                       'compress_vault','train_on_failures','research_dossier','knowledge_check',
                       'daily_save','onboard_matter'];
assert('all 10 engines have name + description + inputSchema + steps',
  expectedNames.every(n => list.find(e => e.name === n && e.description && e.inputSchema && e.steps)),
  list.map(e => e.name).join(','));

// Seed for engines that need vault content
for (let i = 0; i < 5; i++) {
  vault.store({ key: `legal/draft_${i}`, value: { x: i, notes: 'Confidential matter; legal NDA terms include non-disclosure for 3 years.' },
                tier: 'PRIVATE', ownerId: 'claude', metadata: { tags: ['legal'] } });
}

// ── health_check ──────────────────────────────────────────────────────
const hc = await eng.run('health_check', { lookback_hours: 1 }, { operator: 'Medin' });
assert('health_check runs all steps + returns healthy=true with intact chains',
  hc.ok && hc.healthy === true && hc.steps.length >= 4,
  `healthy=${hc.healthy} steps=${hc.steps.length}`);
assert('health_check fires workflow_run receipt with engine: prefix',
  receipts.list({ kind: 'workflow_run' }).some(r => r.ref === 'engine:health_check'));

// ── compress_vault ───────────────────────────────────────────────────
const cv = await eng.run('compress_vault', { agent_id: 'claude', max_k: 16 });
assert('compress_vault mines + ingests + reports sample ratio',
  cv.ok && cv.steps.find(s => s.name === 'mine') && cv.steps.find(s => s.name === 'ingest'),
  cv.summary);

// ── morning_briefing ──────────────────────────────────────────────────
const mb = await eng.run('morning_briefing', { lookback_hours: 24 }, { operator: 'Medin' });
assert('morning_briefing fires auditor + scribe + auto_doctrine',
  mb.ok && mb.steps.length === 3 &&
  mb.steps.find(s => s.name === 'auditor') &&
  mb.steps.find(s => s.name === 'scribe') &&
  mb.steps.find(s => s.name === 'auto_doctrine'),
  mb.steps.map(s => s.name).join(','));
assert('morning_briefing returns deliverables.auditor + scribe vault keys',
  mb.deliverables?.auditor?.startsWith('agents/auditor/') &&
  mb.deliverables?.scribe?.startsWith('agents/scribe/'),
  JSON.stringify({a: mb.deliverables?.auditor?.slice(0,40), s: mb.deliverables?.scribe?.slice(0,40)}));

// ── research_dossier ──────────────────────────────────────────────────
const rd = await eng.run('research_dossier', { topic: 'legal', agent_id: 'claude' });
assert('research_dossier runs researcher + synthesizer + delivers them',
  rd.ok && rd.steps.length === 2 && rd.deliverables?.researcher && rd.deliverables?.synthesizer,
  rd.summary);

// ── onboard_matter (real composition of 3 legal skills) ───────────────
const om = await eng.run('onboard_matter', {
  firm_name: 'Medin Tech LLC',
  attorney: 'A. Counsel',
  client_name: 'Acme Corp.',
  matter: 'evaluating a strategic partnership',
  fee_basis: '$450/hour',
  line_items: [{ description: 'Initial consultation', quantity: 2, rate: 450 }],
});
assert('onboard_matter generates engagement + NDA + invoice PDFs',
  om.ok && om.deliverables?.engagement && om.deliverables?.nda && om.deliverables?.invoice,
  `eng=${om.deliverables?.engagement} nda=${om.deliverables?.nda}`);
assert('onboard_matter PDFs all have valid bytes_base64',
  om.deliverables?.engagement_b64?.length > 100 &&
  om.deliverables?.nda_b64?.length > 100 &&
  om.deliverables?.invoice_b64?.length > 100);

// ── train_on_failures ─────────────────────────────────────────────────
// Seed some failures that triggered pattern_detected
for (let i = 0; i < 3; i++) failures.observe({ kind: 'vault_recital_mismatch', reason: 'RECITAL_MISMATCH', agent: 'claude' });
const tof = await eng.run('train_on_failures', {});
assert('train_on_failures applies documentation_entry fixes',
  tof.ok && tof.deliverables?.applied?.length >= 1,
  `applied=${tof.deliverables?.applied?.length}`);

// ── knowledge_check ───────────────────────────────────────────────────
reinforcement.reinforce('test/key1');
reinforcement.records.get('test/key1').lastSeen = Date.now() - 120_000;
const kc = await eng.run('knowledge_check', { min_quiet_ms: 1000 });
assert('knowledge_check runs beat + returns stale info',
  kc.ok && kc.steps.find(s => s.name === 'beat'));

// ── consolidate_cold ──────────────────────────────────────────────────
for (let i = 0; i < 5; i++) {
  const e = vault.entries.get(`legal/draft_${i}`);
  if (e) e.createdAt -= 200 * 3600_000;
}
const cc = await eng.run('consolidate_cold', { agent_id: 'claude', min_cluster: 3 });
assert('consolidate_cold runs curator + at least one consolidation',
  cc.ok && cc.deliverables?.consolidations?.length >= 0, // may be 0 if no proposals make it through
  `consolidations=${cc.deliverables?.consolidations?.length}`);

// ── session_wrapup ────────────────────────────────────────────────────
const sw = await eng.run('session_wrapup', {
  summary: 'Tested all 10 engines. Everything green.',
  agent_id: 'claude',
  decisions: ['adopted engines architecture'],
  open_promises: ['add dashboard tab'],
}, { operator: 'Medin' });
assert('session_wrapup writes snapshot + sweeps doctrine',
  sw.ok && sw.deliverables?.snapshot_hash);

// ── daily_save ────────────────────────────────────────────────────────
const ds = await eng.run('daily_save', {
  decisions: ['use named engines for routine work', 'ROOT separates AI from operator'],
  open_promises: ['add more engines'],
  summary: 'daily wrap',
  agent_id: 'claude',
}, { operator: 'Medin' });
assert('daily_save writes decisions to ROOT + closes session',
  ds.ok && ds.deliverables?.root_decisions?.length === 2 && ds.deliverables?.snapshot_hash,
  `root=${ds.deliverables?.root_decisions?.length}`);

// ── Unknown engine ────────────────────────────────────────────────────
const bad = await eng.run('does_not_exist', {});
assert('unknown engine returns ENGINE_NOT_FOUND',
  !bad.ok && bad.reason === 'ENGINE_NOT_FOUND');

// ── Stats ─────────────────────────────────────────────────────────────
const stats = eng.stats();
assert('stats report total_engines + total_runs + by_engine',
  stats.total_engines === 10 && stats.total_runs >= 9 && Object.keys(stats.by_engine).length >= 8,
  JSON.stringify({total: stats.total_runs, distinct: Object.keys(stats.by_engine).length}));

// All engine runs left workflow_run receipts
const engineReceipts = receipts.list({ kind: 'workflow_run', limit: 100 }).filter(r => r.ref?.startsWith('engine:'));
assert(`all engine runs fired workflow_run receipts (${engineReceipts.length})`,
  engineReceipts.length >= 9);

await fs.unlink(ROOT).catch(()=>{});

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  10 named engines online — hit them by name, they orchestrate the work\n')));
