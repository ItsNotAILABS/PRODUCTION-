// Smoke for the efficiency layer: cache, budget, context delta.

import { SkillCache }    from './cache.mjs';
import { BudgetTracker } from './budget.mjs';
import { ContextLog }    from './context.mjs';

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      Y = s => `\x1b[33m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d='') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== EFFICIENCY LAYER — SMOKE ===\n'));

// Cache: hit/miss, never-cache pattern, deterministic input → same key
const ch = new SkillCache();
assert('cacheable() rejects side-effect skills (integrations.*, vault_*, workflows_run, etc.)',
  !ch.cacheable('integrations.github.create_issue') &&
  !ch.cacheable('vault_store') &&
  !ch.cacheable('workflows_run') &&
   ch.cacheable('writing.compress'),
  '');

const miss = ch.get('writing.compress', { text: 'hi' });
assert('first get returns null (miss)', miss === null);
ch.set('writing.compress', { text: 'hi' }, { ok: true, compressed: 'hi' }, { ms: 5 });
const hit = ch.get('writing.compress', { text: 'hi' });
assert('second get returns the cached result (hit)', hit?.ok && hit.compressed === 'hi');

// Key stability: same input shape in different key order = same hit
ch.set('finance.runway', { cash_balance: 100, monthly_burn: 10 }, { ok: true, runway_months: 10 });
const stable = ch.get('finance.runway', { monthly_burn: 10, cash_balance: 100 });
assert('cache key is order-stable ({a,b} === {b,a})', stable?.ok && stable.runway_months === 10);

// Never cache failures
ch.set('writing.compress', { text: 'x' }, { ok: false, reason: 'BAD' });
const failNotCached = ch.get('writing.compress', { text: 'x' });
assert('failures are not cached', failNotCached === null);

const view = ch.view();
assert('cache.view reports hit_rate and stats',
  view.size > 0 && typeof view.hit_rate === 'number' && view.hits >= 2,
  `size=${view.size} hits=${view.hits} hit_rate=${view.hit_rate}`);

// Budget: caps, percent_used, warnings
const bt = new BudgetTracker();
bt.setCap('claude', { tool_calls: 10, estimated_tokens: 5000 });
for (let i = 0; i < 8; i++) bt.record('claude', 'writing.compress', { input: { text: 'x'.repeat(40) }, output: { ok: true, compressed: 'x' } });
const chk = bt.check('claude');
assert('budget.check returns within_budget=true at 80%',
  chk.within_budget === true && chk.warning === 'APPROACHING_CAP',
  `pct=${chk.percent_used} warn=${chk.warning}`);

for (let i = 0; i < 4; i++) bt.record('claude', 'writing.compress', { input: { text: 'x'.repeat(40) }, output: { ok: true, compressed: 'x' } });
const over = bt.check('claude');
assert('budget.check flips to within_budget=false past cap',
  over.within_budget === false && over.warning === 'OVER_CAP',
  `pct=${over.percent_used} warn=${over.warning}`);

const bv = bt.view('claude');
assert('budget.view reports top_skills', bv.top_skills?.length >= 1 && bv.top_skills[0][0] === 'writing.compress',
  JSON.stringify(bv.top_skills?.[0]));

// Context delta: only new/changed since base hash
const cl = new ContextLog();
const s1 = cl.snapshot({ agent: 'claude', summary: 'first',
  focus: [{ key: 'a' }], active_plans: [{ id: 'p1', title: 'p1' }],
  open_promises: ['promise-x'], decisions: ['decision-1'] });
const s2 = cl.snapshot({ agent: 'claude', summary: 'second',
  focus: [{ key: 'a' }, { key: 'b' }], active_plans: [{ id: 'p1', title: 'p1' }, { id: 'p2', title: 'p2' }],
  open_promises: ['promise-y'], decisions: ['decision-1', 'decision-2'] });

const delta = cl.openDelta({ agent: 'claude', since_hash: s1.snapshot.hash });
assert('delta reports added_focus only', delta.delta.added_focus.length === 1 && delta.delta.added_focus[0].key === 'b');
assert('delta reports new_plans only',   delta.delta.new_plans.length === 1 && delta.delta.new_plans[0].id === 'p2');
assert('delta reports resolved_promises (promise-x gone)',
  delta.delta.resolved_promises.includes('promise-x'));
assert('delta reports new_promises (promise-y added)',
  delta.delta.new_promises.includes('promise-y'));
assert('delta reports new_decisions only', delta.delta.new_decisions.length === 1 && delta.delta.new_decisions[0] === 'decision-2');

const noChange = cl.openDelta({ agent: 'claude', since_hash: s2.snapshot.hash });
assert('delta with current head_hash returns no_change=true', noChange.no_change === true && noChange.delta === null);

const unknownBase = cl.openDelta({ agent: 'claude', since_hash: 'nope' });
assert('delta with unknown since_hash returns full snapshot fallback',
  unknownBase.full?.hash === s2.snapshot.hash && unknownBase.delta === null);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Efficiency layer online — cache hits, budget warnings, context deltas\n')));
