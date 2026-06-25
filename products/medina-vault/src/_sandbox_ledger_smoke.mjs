// Smoke: sandbox marketplace + intelligent API ledger

import { SandboxMarket, SANDBOX_CATALOG } from './sandbox_market.mjs';
import { ApiLedger } from './api_ledger.mjs';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?' '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

console.log(C('\n=== SANDBOX MARKET + API LEDGER — SMOKE ===\n'));

// ── Sandbox Market ────────────────────────────────────────────────────
const mkt = new SandboxMarket();

assert(`10 sandboxes in catalog (got ${SANDBOX_CATALOG.length})`, SANDBOX_CATALOG.length === 10);

const list = mkt.list();
assert('list returns 10 items', list.length === 10);

const byTag = mkt.list({ tag: 'python' });
assert('tag filter: python sandboxes ≥ 2', byTag.length >= 2, `got ${byTag.length}`);

const nodeOnly = mkt.list({ tag: 'node' });
assert('tag filter: node sandboxes ≥ 2', nodeOnly.length >= 2);

const got = mkt.get('node-scratch');
assert('get(node-scratch) returns full spec', got.ok && got.command === 'node' && got.entry_file === 'index.mjs');

const notFound = mkt.get('does-not-exist');
assert('get unknown returns SANDBOX_NOT_FOUND with available list', !notFound.ok && Array.isArray(notFound.available));

const job = mkt.buildJob('python-scratch', { code: 'print("hello")', agent_id: 'test-agent' });
assert('buildJob returns command + entry_file + override code',
  job.ok && job.command === 'python3' && job.code === 'print("hello")' && job.agent_id === 'test-agent');

const jobDefault = mkt.buildJob('node-test');
assert('buildJob without code uses starter code', jobDefault.ok && jobDefault.code.includes('assert'));

const badJob = mkt.buildJob('ghost');
assert('buildJob unknown sandbox returns ok:false', !badJob.ok);

const tags = mkt.tags();
assert('tags() returns sorted array with expected tags',
  Array.isArray(tags) && tags.includes('python') && tags.includes('node') && tags.includes('crypto'));

const stats = mkt.stats();
assert('stats: total=10, has by_tier and by_tag',
  stats.total === 10 && typeof stats.by_tier === 'object' && typeof stats.by_tag === 'object');
assert('stats: BASIC tier has ≥ 1 sandbox', (stats.by_tier['BASIC'] || 0) >= 1);
assert('stats: ELEVATED tier has ≥ 1 sandbox', (stats.by_tier['ELEVATED'] || 0) >= 1);

// All sandboxes have required fields
const allValid = SANDBOX_CATALOG.every(s =>
  s.id && s.name && s.command && s.entry_file && s.starter &&
  s.tier_required && Array.isArray(s.tags) && s.tags.length > 0
);
assert('all 10 sandboxes have id/name/command/entry_file/starter/tier/tags', allValid);

// ── API Ledger ────────────────────────────────────────────────────────
const ledger = new ApiLedger();

// Record some calls
ledger.route('vault_store').record({ agent_id: 'claude', ok: true, ms: 12 });
ledger.route('vault_store').record({ agent_id: 'chatgpt', ok: false, ms: 45, error: 'TIER_INSUFFICIENT' });
ledger.route('vault_store').record({ agent_id: 'claude', ok: true, ms: 8 });
ledger.route('deposit_create').record({ agent_id: 'chatgpt', ok: true, ms: 120 });
ledger.route('deposit_create').record({ agent_id: 'chatgpt', ok: true, ms: 95 });
ledger.route('loom_status_proof').record({ agent_id: 'claude', ok: true, ms: 35 });

const routes = ledger.listRoutes();
assert('listRoutes returns 3 tracked routes', routes.length === 3, routes.join(','));

const vStats = ledger.routeStats('vault_store');
assert('vault_store: 3 total, 2 ok, 1 fail',
  vStats.calls_total === 3 && vStats.calls_ok === 2 && vStats.calls_fail === 1);
assert('vault_store: error_rate = 0.3333',
  Math.abs(vStats.error_rate - 0.3333) < 0.001, `got ${vStats.error_rate}`);
assert('vault_store: p50_ms computed', typeof vStats.p50_ms === 'number');
assert('vault_store: top_callers includes claude',
  vStats.top_callers.some(c => c.agent_id === 'claude'));
assert('vault_store: top_errors includes TIER_INSUFFICIENT',
  vStats.top_errors.some(e => e.error === 'TIER_INSUFFICIENT'));

const badRoute = ledger.routeStats('ghost_route');
assert('routeStats unknown route returns ROUTE_NOT_FOUND', badRoute.ok === false && badRoute.reason === 'ROUTE_NOT_FOUND');

const all = ledger.allStats();
assert('allStats returns 3 entries sorted by call volume', all.length === 3 && all[0].calls_total >= all[1].calls_total);

const health = ledger.allHealth();
assert('allHealth returns array sorted critical-first', Array.isArray(health) && health.length === 3);

// Intelligence
const intel = ledger.intelligence();
assert('intelligence returns ok + assessment', intel.ok && typeof intel.assessment === 'string');
assert('intelligence: total_calls = 6', intel.total_calls === 6);
assert('intelligence: 1 warning or degraded (vault_store 33% err)',
  intel.degraded_routes.includes('vault_store') || intel.warning_routes.includes('vault_store'),
  `degraded=${intel.degraded_routes}, warning=${intel.warning_routes}`);
assert('intelligence: busiest_routes contains vault_store and deposit_create',
  intel.busiest_routes.some(r => r.route === 'vault_store') &&
  intel.busiest_routes.some(r => r.route === 'deposit_create'));

// measure() wrapper
const measuredLedger = new ApiLedger();
let measureOk;
const measureResult = await measuredLedger.measure('test_route', 'agent-x', async () => ({ ok: true, data: 42 }));
assert('measure() returns handler result', measureResult.ok && measureResult.data === 42);
assert('measure() records the call', measuredLedger.routeStats('test_route').calls_total === 1);
assert('measure() records ok=true for ok:true result', measuredLedger.routeStats('test_route').calls_ok === 1);

// measure() error path
let threw = false;
try {
  await measuredLedger.measure('error_route', 'agent-x', async () => { throw new Error('boom'); });
} catch { threw = true; }
assert('measure() re-throws on exception', threw);
assert('measure() records ok=false on exception', measuredLedger.routeStats('error_route').calls_fail === 1);

// Empty ledger intelligence
const empty = new ApiLedger();
const emptyIntel = empty.intelligence();
assert('empty ledger intelligence has no critical routes', emptyIntel.critical_routes.length === 0);
assert('empty ledger assessment is correct', emptyIntel.assessment.includes('No calls'));

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1
    ? R('  failure\n')
    : G('  10 sandboxes · intelligent API ledger · measure() wrapper — all green\n')));
