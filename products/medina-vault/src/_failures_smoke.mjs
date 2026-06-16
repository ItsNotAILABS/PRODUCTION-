// Smoke for failures.mjs — pattern detection + auto-fix proposal.

import { FailureRegistry } from './failures.mjs';
import { ReceiptLedger } from './receipts.mjs';

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      Y = s => `\x1b[33m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d='') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== FAILURE REGISTRY — SMOKE ===\n'));

const rec = new ReceiptLedger();
const fr  = new FailureRegistry({ receipts: rec });

// First failure: bucketed, observed receipt fires, no pattern yet
const f1 = fr.observe({ kind: 'skill_returned_error', reason: 'MISSING_FIELD:recipient_name',
  skill: 'legal.demand_letter', agent: 'claude', input: { sender_name: 'X' } });
assert('first failure creates a bucket', f1.ok && f1.bucket.count === 1);
assert('no pattern detected after 1 failure', !f1.bucket.pattern_detected);
assert('failure_observed receipt fired by system',
  rec.list({ kind: 'failure_observed' }).length === 1 &&
  rec.list({ kind: 'failure_observed' })[0].agent === 'system',
  'agent=' + rec.list({ kind: 'failure_observed' })[0].agent);

// Second failure: same signature
fr.observe({ kind: 'skill_returned_error', reason: 'MISSING_FIELD:recipient_name',
  skill: 'legal.demand_letter', agent: 'claude', input: { sender_name: 'Y' } });

// Third failure: pattern triggers + fix proposed
const f3 = fr.observe({ kind: 'skill_returned_error', reason: 'MISSING_FIELD:recipient_name',
  skill: 'legal.demand_letter', agent: 'claude', input: { sender_name: 'Z' } });
assert('count rolls up to 3 in the same bucket', f3.bucket.count === 3,
  'count=' + f3.bucket.count);
assert('pattern_detected flips true at threshold', f3.bucket.pattern_detected);
assert('fix_proposed flips true at first pattern detection', f3.bucket.fix_proposed);
assert('failure_pattern_detected receipt fired exactly once',
  rec.list({ kind: 'failure_pattern_detected' }).length === 1);
assert('failure_fix_proposed receipt fired exactly once',
  rec.list({ kind: 'failure_fix_proposed' }).length === 1);

// Get the proposal
const got = fr.get(f3.sig);
assert('proposal strategy is validation_precheck for MISSING_FIELD',
  got.ok && got.proposal?.strategy === 'validation_precheck',
  'strategy=' + got.proposal?.strategy);
assert('proposal targets the missing field',
  got.proposal?.action?.missing_field === 'recipient_name',
  'missing_field=' + got.proposal?.action?.missing_field);

// Different failure kind → different bucket
const f4 = fr.observe({ kind: 'vault_recital_mismatch', reason: 'RECITAL_MISMATCH',
  agent: 'claude', input: { key: 'k1' } });
assert('different failure signature creates a different bucket',
  f4.sig !== f3.sig && fr.buckets.size === 2,
  `sigs=${f3.sig.slice(0,6)} vs ${f4.sig.slice(0,6)}, buckets=${fr.buckets.size}`);

// Fourth failure on existing pattern does NOT re-fire pattern detected
fr.observe({ kind: 'skill_returned_error', reason: 'MISSING_FIELD:recipient_name',
  skill: 'legal.demand_letter', agent: 'claude', input: { sender_name: 'A' } });
assert('pattern_detected receipt does NOT re-fire on subsequent failures',
  rec.list({ kind: 'failure_pattern_detected' }).length === 1);

// Apply fix
const applied = fr.applyFix(f3.sig);
assert('apply_fix flips fix_applied + fires failure_fix_applied',
  applied.ok && fr.buckets.get(f3.sig).fix_applied &&
  rec.list({ kind: 'failure_fix_applied' }).length === 1);
assert('cannot apply same fix twice',
  !fr.applyFix(f3.sig).ok && fr.applyFix(f3.sig).reason === 'ALREADY_APPLIED');

// Vault recital pattern → after 3 hits proposes documentation_entry
for (let i = 0; i < 2; i++) fr.observe({ kind: 'vault_recital_mismatch', reason: 'RECITAL_MISMATCH', agent: 'claude' });
const recProp = fr.get(f4.sig);
assert('recital pattern proposes documentation_entry strategy',
  recProp.ok && recProp.proposal?.strategy === 'documentation_entry',
  'strategy=' + recProp.proposal?.strategy);

// Skill threw → sandbox_wrap strategy
for (let i = 0; i < 3; i++) {
  fr.observe({ kind: 'skill_threw', reason: 'SKILL_THREW', skill: 'integrations.github.user',
    agent: 'claude', message: 'TypeError: Cannot read x' });
}
const threwBucket = [...fr.buckets.values()].find(b => b.kind === 'skill_threw');
const threwProp = fr.get(threwBucket.sig);
assert('skill_threw pattern proposes sandbox_wrap',
  threwProp.proposal?.strategy === 'sandbox_wrap',
  'strategy=' + threwProp.proposal?.strategy);

// Integration key missing → documentation_entry
for (let i = 0; i < 3; i++) {
  fr.observe({ kind: 'integration_key_missing', reason: 'KEY_OR_NETWORK',
    skill: 'integrations.github.user', agent: 'claude',
    message: 'github API key not configured (call keys_set name=github)' });
}
const keyBucket = [...fr.buckets.values()].find(b => b.kind === 'integration_key_missing');
const keyProp = fr.get(keyBucket.sig);
assert('integration_key_missing pattern proposes documentation_entry',
  keyProp.proposal?.strategy === 'documentation_entry',
  'strategy=' + keyProp.proposal?.strategy);

// Stats
const s = fr.stats();
assert('stats roll up patterns_detected, fixes_proposed, fixes_applied correctly',
  s.patterns_detected >= 4 && s.fixes_proposed >= 4 && s.fixes_applied === 1,
  JSON.stringify({ p: s.patterns_detected, fp: s.fixes_proposed, fa: s.fixes_applied }));
assert('stats include by_kind histogram',
  s.by_kind.skill_returned_error >= 4 && s.by_kind.vault_recital_mismatch >= 3,
  JSON.stringify(s.by_kind));

// All failure receipts written by system, never by AI
const failureReceipts = ['failure_observed', 'failure_pattern_detected',
                         'failure_fix_proposed', 'failure_fix_applied']
  .flatMap(k => rec.list({ kind: k, limit: 1000 }));
const systemOnly = failureReceipts.every(r => r.agent === 'system');
assert('every failure receipt has agent="system" — AI wrote zero',
  systemOnly && failureReceipts.length >= 10,
  `total=${failureReceipts.length} system_only=${systemOnly}`);

// Round-trip persistence
const meta = fr.toMeta();
const fr2 = new FailureRegistry({ receipts: new ReceiptLedger() });
fr2.loadFromMeta(meta);
assert('failure registry survives meta round-trip',
  fr2.buckets.size === fr.buckets.size && fr2.proposals.length === fr.proposals.length,
  `buckets=${fr2.buckets.size}/${fr.buckets.size} props=${fr2.proposals.length}/${fr.proposals.length}`);

// Dismiss path
fr2.dismiss(f4.sig);
const dismissed = fr2.proposals.find(p => p.sig === f4.sig);
assert('dismiss marks proposal status=dismissed without applying',
  dismissed?.status === 'dismissed', `status=${dismissed?.status}`);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Failure registry online · system observes errors · patterns detected · fixes proposed autonomously\n')));
