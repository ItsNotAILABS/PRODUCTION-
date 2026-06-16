// Smoke for graph / knowledge tokens / sandbox / receipts / integrations.
// Real round-trips, no mocks. Integration tests stop short of hitting GitHub
// over the network unless GH_TEST_TOKEN is set; otherwise they just assert
// the "key not configured" path returns the structured error correctly.

import { SessionGraph }     from './graph.mjs';
import { KnowledgeLedger }  from './knowledge_tokens.mjs';
import { SkillSandbox }     from './sandbox.mjs';
import { ReceiptLedger }    from './receipts.mjs';
import { SkillRegistry }    from './skills.mjs';
import { WorkflowRunner }   from './workflows.mjs';
import { KeyVault }         from './keys.mjs';
import { buildGitHubSkills } from './integrations/github.mjs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d = '') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d ? '  ' + Y('· ' + d) : ''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== GRAPH / KNOWLEDGE / SANDBOX / RECEIPTS / INTEGRATIONS ===\n'));

// ── Graph: real BFS path traversal ────────────────────────────────────
const g = new SessionGraph();
g.addNode({ id: 'entry:foo', kind: 'entry', label: 'foo' });
g.addNode({ id: 'entry:bar', kind: 'entry', label: 'bar' });
g.addNode({ id: 'agent:claude', kind: 'agent', label: 'claude' });
g.link('agent:claude', 'entry:foo', 'observed');
g.link('entry:foo',   'entry:bar', 'derived_from');
assert('graph creates a current session on construction',
  g.session?.kind === 'session' && /^[a-f0-9]{16}$/.test(g.session.hash), g.session?.hash);
const path = g.path('agent:claude', 'entry:bar');
assert('graph BFS finds 2-hop path agent→entry→entry',
  path.ok && path.hops === 2, JSON.stringify(path));
assert('graph reports stats with by_kind counts',
  g.stats().by_kind.entry === 2 && g.stats().by_kind.agent === 1 && g.stats().by_kind.session === 1,
  JSON.stringify(g.stats().by_kind));
const meta = g.toMeta();
const g2 = new SessionGraph();
g2.loadFromMeta(meta);
assert('graph survives serialize → deserialize round-trip',
  g2.path('agent:claude', 'entry:bar').ok, JSON.stringify(g2.path('agent:claude', 'entry:bar')));

// ── Knowledge tokens: mint, unwrap, reward, KT- prefix ────────────────
const k = new KnowledgeLedger();
const minted = k.mint({
  name: 'ecosystem_law_v1', minter: 'claude',
  summary: 'φ-decay + Custos engagement + Fibonacci tier weights form one coherent law: AI behavior is shaped by what the vault rewards.',
  domains: ['memory','tokenomics','governance'],
  inputs: [
    { kind: 'entry', ref: 'protocols/PROTOCOL_05' },
    { kind: 'entry', ref: 'protocols/PROTOCOL_08' },
    { kind: 'entry', ref: 'protocols/PROTOCOL_09' },
  ],
});
assert('knowledge.mint returns KT-<12 hex> id',
  minted.ok && /^KT-[a-f0-9]{12}$/.test(minted.token.id), minted.token?.id);
assert('mint rewards memory tokens > 0 (log1p(n) × |domains| × φ)',
  minted.mt_reward > 0, `reward=${minted.mt_reward}`);
const dupe = k.mint({
  name: 'ecosystem_law_v1', minter: 'claude',
  summary: 'φ-decay + Custos engagement + Fibonacci tier weights form one coherent law: AI behavior is shaped by what the vault rewards.',
  domains: ['memory','tokenomics','governance'],
  inputs: [
    { kind: 'entry', ref: 'protocols/PROTOCOL_05' },
    { kind: 'entry', ref: 'protocols/PROTOCOL_08' },
    { kind: 'entry', ref: 'protocols/PROTOCOL_09' },
  ],
});
assert('mint rejects duplicate (same inputs + summary + ts unlikely; same hash → DUPLICATE)',
  !dupe.ok && dupe.reason === 'DUPLICATE', dupe.reason);
const bad = k.mint({ name: 'x', summary: 'y', inputs: [{ kind: 'entry', ref: 'a' }] });
assert('mint rejects <2 inputs (knowledge requires fusion)',
  !bad.ok && bad.reason === 'MIN_2_INPUTS', bad.reason);
const unw = k.unwrap(minted.token.id);
assert('unwrap returns the summary + increments counter',
  unw.ok && unw.summary.includes('φ-decay') && unw.unwraps === 1, `unwraps=${unw.unwraps}`);
const stats = k.stats();
assert('knowledge.stats reports total / by_domain / top_unwrapped',
  stats.total === 1 && stats.by_domain.memory === 1 && stats.top_unwrapped.length === 1,
  JSON.stringify(stats.by_domain));

// ── Sandbox: draft → test x3 → stable → promote ───────────────────────
const reg = new SkillRegistry();
const wr  = new WorkflowRunner({ registry: reg });
const sb  = new SkillSandbox({ registry: reg, runner: wr });
const dr  = sb.draft({
  name: 'demand_with_redact',
  composition: { id: 'demand_with_redact', nodes: [
    { id: 'demand', skill: 'legal.demand_letter',
      input: { sender_name: 'Medin', recipient_name: 'X', claim_summary: 'late delivery.',
               demand: 'deliver', amount_usd: 5000 } },
    { id: 'redact', skill: 'writing.redact_pii',
      input: { text: 'Contact alice@example.com or 555-123-4567.' } },
  ] },
});
assert('sandbox.draft creates a draft with id', dr.ok && dr.draft.status === 'draft', dr.draft?.id);
for (let i = 0; i < 3; i++) await sb.test(dr.draft.id, {});
const ev = sb.evaluate(dr.draft.id);
assert('sandbox.evaluate marks status=stable after 3 consistent runs',
  ev.ok && ev.status === 'stable' && ev.stability >= 0.85,
  `status=${ev.status} stability=${ev.stability}`);
const pr = sb.promote(dr.draft.id);
assert('sandbox.promote registers composed.<name> in registry',
  pr.ok && pr.promoted_as === 'composed.demand_with_redact' &&
  reg.skills.has('composed.demand_with_redact'),
  pr.promoted_as);
const rejPromote = sb.promote(dr.draft.id);
assert('cannot promote twice (status now "promoted", not "stable")',
  !rejPromote.ok && rejPromote.reason === 'NOT_STABLE', rejPromote.reason);

// ── Receipts: append, verify, tamper detection ────────────────────────
const rec = new ReceiptLedger();
rec.append({ kind: 'vault_store', ref: 'k1', agent: 'claude', meta: { tier: 'PRIVATE' } });
rec.append({ kind: 'skill_run',   ref: 'legal.nda_mutual', agent: 'claude', meta: { ok: true } });
rec.append({ kind: 'token_mint',  ref: 'KT-abcdef012345', agent: 'claude', meta: { name: 'law' } });
const v = rec.verify();
assert('receipt chain verifies intact after 3 appends',
  v.ok && v.length === 3 && /^[a-f0-9]{64}$/.test(v.head_hash), `head=${v.head_hash?.slice(0,12)}…`);
// Tamper with middle receipt
rec.receipts[1].meta = { ok: false }; // edit history
const t = rec.verify();
assert('tampering with a receipt breaks the chain at first_broken_seq',
  !t.ok && t.reason === 'CHAIN_BROKEN' && t.first_broken_seq === 1,
  `broken@${t.first_broken_seq}`);
// Stats
rec.receipts[1].meta = { ok: true }; // restore for stats check
const ststats = rec.stats();
assert('receipt stats report by_kind counts',
  ststats.total === 3 && ststats.by_kind.vault_store === 1, JSON.stringify(ststats.by_kind));
const badKind = rec.append({ kind: 'not_a_real_kind', ref: 'x' });
assert('receipt rejects invalid kind', !badKind.ok && badKind.reason === 'INVALID_KIND', badKind.reason);

// ── Integrations: GitHub skills register, fail cleanly without key ────
const kv = new KeyVault();
const ghSkills = buildGitHubSkills({ keys: kv, receipts: rec });
assert('GitHub integration exposes 4 skills',
  ghSkills.length === 4 &&
  ghSkills.some(s => s.name === 'integrations.github.user') &&
  ghSkills.some(s => s.name === 'integrations.github.create_issue'),
  ghSkills.map(s => s.name).join(','));

const noKey = await ghSkills[0].run({});
assert('GitHub call without key returns structured KEY_OR_NETWORK error',
  !noKey.ok && noKey.reason === 'KEY_OR_NETWORK' && noKey.message.includes('not configured'),
  noKey.message?.slice(0, 60));

// If a real test token is provided, prove the live wire works end-to-end
if (process.env.GH_TEST_TOKEN) {
  kv.set('github', process.env.GH_TEST_TOKEN);
  const live = await ghSkills[0].run({});
  assert('GitHub /user returns 200 with login + id when key valid',
    live.ok && typeof live.user?.login === 'string' && typeof live.user?.id === 'number',
    `login=${live.user?.login}`);
}

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                           : G('  Knowledge layer online — graph traversal, KT minting, sandbox promotion, Merkle receipts, GitHub framework\n')));
