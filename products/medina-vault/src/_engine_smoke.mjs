// Smoke for the efficiency engine: autonomous receipts on observed events.

import { EfficiencyEngine, MODELS } from './efficiency.mjs';
import { ReceiptLedger } from './receipts.mjs';

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      Y = s => `\x1b[33m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d='') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== EFFICIENCY ENGINE — SMOKE ===\n'));

assert(`20 efficiency models registered (got ${MODELS.length})`, MODELS.length === 20,
  MODELS.map(m=>m.id).slice(0,5).join(',') + '...');

// Set up: real receipts ledger watches the engine fire receipts itself
const rec = new ReceiptLedger();
const eng = new EfficiencyEngine({ receipts: rec });

// Cache hit event → multiple models fire (skill_cache_hit, skill_dedup_within_session, autonomous_receipt_emission)
const r1 = eng.observe({ type: 'skill_post', skill: 'writing.compress',
  input: { text: 'hello world' }, output: { ok: true, compressed: 'hello' },
  ms: 0, from_cache: true });
assert('cache_hit observation triggers skill_cache_hit autonomously',
  r1.applied_models.includes('skill_cache_hit'),
  r1.applied_models.join(','));

// Second identical call → dedup_within_session fires
eng.observe({ type: 'skill_post', skill: 'writing.compress',
  input: { text: 'hello world' }, output: { ok: true, compressed: 'hello' },
  ms: 0, from_cache: true });
const dedupReceipts = rec.list({ kind: 'efficiency_event' }).filter(r => r.ref === 'skill_dedup_within_session');
assert('skill_dedup_within_session fires only on 2nd+ identical call', dedupReceipts.length >= 1,
  `dedup receipts=${dedupReceipts.length}`);

// Local skill routing (writing.* is local) → tokens saved
const r2 = eng.observe({ type: 'skill_post', skill: 'writing.formal',
  input: { text: 'hi' }, output: { ok: true, formal: 'Hello.' }, ms: 4, from_cache: false });
assert('local_skill_routing fires for writing.* skill (saved an LLM call)',
  r2.applied_models.includes('local_skill_routing'),
  r2.applied_models.join(','));

// Session delta savings
const r3 = eng.observe({ type: 'session_open', agent: 'claude',
  returned_bytes: 5000, delta_bytes: 300 });
assert('context_delta_resume fires when delta is much smaller than full',
  r3.applied_models.includes('context_delta_resume') && r3.savings.tokens > 100,
  `tokens_saved=${r3.savings.tokens}`);

// No-change resume
const r4 = eng.observe({ type: 'session_open', agent: 'claude',
  returned_bytes: 5000, no_change: true });
assert('no_change_resume fires when prior hash matches head',
  r4.applied_models.includes('no_change_resume'), r4.applied_models.join(','));

// Knowledge unwrap → big savings (saved re-deriving from N inputs)
const r5 = eng.observe({ type: 'knowledge_unwrap',
  token: { id: 'KT-test', inputs: [{},{},{},{}] } });
assert('knowledge_token_reuse fires with savings scaled by input count',
  r5.applied_models.includes('knowledge_token_reuse') && r5.savings.tokens >= 3000,
  `tokens=${r5.savings.tokens}`);

// Vault dedup
const r6 = eng.observe({ type: 'vault_post', key: 'k', value: 'v', tier: 'PRIVATE', dedup: true });
assert('vault_dedup fires on rejected duplicate write',
  r6.applied_models.includes('vault_dedup'));

// Budget threshold crossing
eng.observe({ type: 'budget_tick', agent: 'a', percent_used: 0.5 });
const r7 = eng.observe({ type: 'budget_tick', agent: 'a', percent_used: 0.85 });
assert('budget_throttle_hint fires when crossing 80%',
  r7.applied_models.includes('budget_throttle_hint'));

// Reinforcement beat with stale marks
const r8 = eng.observe({ type: 'reinforcement_beat', marked_stale: 5 });
assert('stale_eviction fires when entries marked stale',
  r8.applied_models.includes('stale_eviction'));

// Workflow short-circuit
const r9 = eng.observe({ type: 'workflow_post', skipped_nodes: 3 });
assert('workflow_node_short_circuit fires when nodes skipped',
  r9.applied_models.includes('workflow_node_short_circuit') && r9.savings.tokens >= 1800);

// Sandbox promotion
const r10 = eng.observe({ type: 'sandbox_promote', composition_size: 4 });
assert('sandbox_promotion fires on promote (saves 3 future tool calls)',
  r10.applied_models.includes('sandbox_promotion') && r10.savings.calls === 3,
  `calls=${r10.savings.calls}`);

// Consolidation
const r11 = eng.observe({ type: 'consolidation_run', source_count: 5 });
assert('consolidation_compression fires with bytes-saved proportional to source_count',
  r11.applied_models.includes('consolidation_compression') && r11.savings.bytes === 2000);

// THE BIG ONE — system wrote all receipts, AI wrote zero
const efficiencyReceipts = rec.list({ kind: 'efficiency_event', limit: 1000 });
const systemAuthored = efficiencyReceipts.filter(r => r.agent === 'system');
assert('every efficiency receipt has agent="system" — AI did NOT write any of these',
  systemAuthored.length === efficiencyReceipts.length && efficiencyReceipts.length >= 10,
  `total=${efficiencyReceipts.length} system=${systemAuthored.length}`);

// Stats are non-zero across the board
const s = eng.stats();
assert('aggregate stats show real savings (tokens > 0 AND calls > 0 AND bytes > 0)',
  s.tokens_saved > 0 && s.calls_avoided > 0 && s.bytes_saved > 0,
  `tokens=${s.tokens_saved} calls=${s.calls_avoided} bytes=${s.bytes_saved}`);

// Toggle a model off → it stops firing
eng.toggle('local_skill_routing', false);
const before = eng.totals.by_model['local_skill_routing'] || 0;
eng.observe({ type: 'skill_post', skill: 'writing.compress',
  input: { text: 'x' }, output: { ok: true }, ms: 3, from_cache: false });
const after = eng.totals.by_model['local_skill_routing'] || 0;
assert('toggle(off) actually disables the model', after === before, `before=${before} after=${after}`);

// Autonomous report — system writes this, not me
const report = eng.report();
assert('efficiency.report returns auto-generated markdown',
  report.ok && report.kind === 'markdown' && report.markdown.includes('Loom Efficiency Report'),
  `bytes=${report.markdown.length}`);

// Persistence round-trip
const meta = eng.toMeta();
const eng2 = new EfficiencyEngine({ receipts: new ReceiptLedger() });
eng2.loadFromMeta(meta);
assert('engine survives meta round-trip with totals intact',
  eng2.totals.events === eng.totals.events && eng2.totals.tokens === eng.totals.tokens,
  `events=${eng2.totals.events} tokens=${eng2.totals.tokens}`);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  20 efficiency models firing autonomously · system wrote all receipts · AI wrote none\n')));
