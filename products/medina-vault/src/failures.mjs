// failures.mjs — failure registry. The system OBSERVES every failure, caches
// by signature, learns patterns, and auto-proposes fixes after N occurrences.
//
// SIGNATURE = sha1-12(kind || reason || skill?)
//   Same root cause → same bucket. Different inputs that trigger the same
//   failure aggregate into one knowledge unit.
//
// LIFECYCLE
//   observe()    — system writes failure_observed receipt + buckets the failure
//   pattern_detected — at PATTERN_THRESHOLD (3) failures in one bucket, fires
//                       failure_pattern_detected receipt; pattern becomes
//                       eligible for auto-fix proposal
//   propose_fix  — generate a structured fix proposal:
//                    · validation_precheck (input validator skill)
//                    · sandbox_wrap        (sandbox draft that adds defensive code)
//                    · documentation_entry (vault PRIVATE entry explaining the trap)
//                  Fires failure_fix_proposed
//   apply_fix    — operator (or AI) accepts → fires failure_fix_applied
//
// The AI never has to write any of these receipts. The system observes the
// activity and writes them on its own.

import { createHash } from 'node:crypto';

const PATTERN_THRESHOLD  = 3;
const MAX_CONTEXTS       = 20;
const MAX_BUCKETS        = 500;

const KNOWN_FAILURE_KINDS = new Set([
  'skill_threw', 'skill_returned_error',
  'vault_recital_mismatch', 'vault_genesis_expects_empty', 'vault_invalid_tier',
  'vault_sovereign_owner_only', 'vault_tier_forbidden',
  'workflow_node_failed', 'sandbox_draft_rejected',
  'integration_key_missing', 'integration_remote_error',
  'plan_invalid_status', 'plan_step_not_found',
  'knowledge_duplicate', 'knowledge_min_inputs',
  'unknown',
]);

function signature(kind, reason, skill) {
  return createHash('sha1').update(`${kind}|${reason}|${skill || ''}`).digest('hex').slice(0, 12);
}

export class FailureRegistry {
  constructor({ receipts } = {}) {
    this.receipts = receipts;
    /** @type {Map<string, FailureBucket>} */
    this.buckets = new Map();
    this.proposals = []; // proposed fixes, newest first
  }

  loadFromMeta(meta) {
    if (!meta?.failures) return;
    if (Array.isArray(meta.failures.buckets)) for (const b of meta.failures.buckets) this.buckets.set(b.sig, b);
    if (Array.isArray(meta.failures.proposals)) this.proposals = meta.failures.proposals.slice();
  }
  toMeta() {
    const buckets = [...this.buckets.values()].slice(-MAX_BUCKETS);
    return { failures: { buckets, proposals: this.proposals.slice(0, 50) } };
  }

  /**
   * The system observes a failure. Always returns the bucket; AI does nothing.
   * failure = { kind, reason, skill?, agent?, input?, message? }
   */
  observe(failure) {
    const kind = KNOWN_FAILURE_KINDS.has(failure?.kind) ? failure.kind : 'unknown';
    const reason = failure?.reason || 'UNSPECIFIED';
    const skill = failure?.skill || null;
    const sig = signature(kind, reason, skill);

    let b = this.buckets.get(sig);
    if (!b) {
      b = { sig, kind, reason, skill, count: 0, first_seen: Date.now(),
            last_seen: Date.now(), contexts: [], pattern_detected: false,
            fix_proposed: false, fix_applied: false };
      this.buckets.set(sig, b);
    }
    b.count++;
    b.last_seen = Date.now();
    if (failure.input || failure.message) {
      b.contexts.push({
        ts: Date.now(), agent: failure.agent || null,
        input_keys: failure.input ? Object.keys(failure.input).slice(0, 8) : null,
        message: failure.message?.slice(0, 200) || null,
      });
      if (b.contexts.length > MAX_CONTEXTS) b.contexts.shift();
    }

    this.receipts?.append({
      kind: 'failure_observed', ref: sig, agent: 'system',
      meta: { failure_kind: kind, reason, skill, occurrence: b.count },
    });

    // Pattern detection — once per bucket
    if (b.count >= PATTERN_THRESHOLD && !b.pattern_detected) {
      b.pattern_detected = true;
      this.receipts?.append({
        kind: 'failure_pattern_detected', ref: sig, agent: 'system',
        meta: { kind, reason, skill, threshold: PATTERN_THRESHOLD, count: b.count },
      });
    }

    // Auto-propose fix the first time we cross threshold
    if (b.pattern_detected && !b.fix_proposed) {
      const proposal = this._propose(b);
      if (proposal) {
        b.fix_proposed = true;
        this.proposals.unshift(proposal);
        this.receipts?.append({
          kind: 'failure_fix_proposed', ref: sig, agent: 'system',
          meta: { strategy: proposal.strategy, summary: proposal.summary },
        });
      }
    }

    return { ok: true, sig, bucket: b };
  }

  /**
   * Pick a fix strategy from the failure's structure. Deterministic — same
   * signature, same proposal.
   */
  _propose(bucket) {
    const { kind, reason, skill, sig, contexts } = bucket;
    let strategy, summary, action;
    if (kind === 'skill_returned_error' && reason?.startsWith('MISSING_FIELD')) {
      strategy = 'validation_precheck';
      const field = reason.split(':')[1];
      summary = `Skill ${skill} repeatedly fails on missing field '${field}'. ` +
                `Add a precheck that returns INVALID_INPUT with a friendly hint before invocation.`;
      action = { kind: 'validation_precheck', skill, missing_field: field };
    } else if (kind === 'vault_recital_mismatch') {
      strategy = 'documentation_entry';
      summary = `vault_store recital mismatch repeated ${bucket.count} times. ` +
                `Document the contract: callers must include prior_hash from the prior retrieve.`;
      action = { kind: 'documentation_entry', tier: 'PRIVATE', key: `failures/${sig}/recital_contract` };
    } else if (kind === 'integration_key_missing') {
      strategy = 'documentation_entry';
      summary = `Integration calls failing because key not configured. Add a check that surfaces a clear ` +
                `'call keys_set name=<x>' hint up front and store the policy.`;
      action = { kind: 'documentation_entry', tier: 'PRIVATE', key: `failures/${sig}/integration_key_policy` };
    } else if (kind === 'skill_threw') {
      strategy = 'sandbox_wrap';
      summary = `Skill ${skill} threw uncaught exception ${bucket.count}× — propose a sandbox draft ` +
                `that wraps it with try/catch + structured error.`;
      action = { kind: 'sandbox_wrap', skill };
    } else if (kind === 'workflow_node_failed') {
      strategy = 'workflow_continue_on_error';
      summary = `Workflow node failed ${bucket.count}×. Mark this node continue_on_error to keep ` +
                `the rest of the chain running.`;
      action = { kind: 'workflow_continue_on_error' };
    } else if (kind === 'knowledge_duplicate' || kind === 'knowledge_min_inputs') {
      strategy = 'documentation_entry';
      summary = `Repeated misuse of knowledge_mint (${reason}). Document the contract: ≥2 inputs ` +
                `required; same fusion is detected as duplicate by hash.`;
      action = { kind: 'documentation_entry', tier: 'PRIVATE', key: `failures/${sig}/knowledge_contract` };
    } else {
      strategy = 'documentation_entry';
      summary = `Repeated failure ${kind}/${reason}. Document the cause and any known workaround.`;
      action = { kind: 'documentation_entry', tier: 'PRIVATE', key: `failures/${sig}/notes` };
    }
    return {
      sig, strategy, summary, action,
      created: Date.now(), status: 'proposed',
      sample_context: contexts[contexts.length - 1] || null,
    };
  }

  /**
   * Operator (or AI) accepts a proposal. The system applies it where possible,
   * fires failure_fix_applied. For documentation_entry we return the entry the
   * caller should vault_store.
   */
  applyFix(sig) {
    const bucket = this.buckets.get(sig);
    if (!bucket) return { ok: false, reason: 'BUCKET_NOT_FOUND' };
    if (!bucket.fix_proposed) return { ok: false, reason: 'NO_PROPOSAL' };
    const proposal = this.proposals.find(p => p.sig === sig);
    if (!proposal) return { ok: false, reason: 'PROPOSAL_NOT_FOUND' };
    if (bucket.fix_applied) return { ok: false, reason: 'ALREADY_APPLIED' };
    bucket.fix_applied = true;
    proposal.status = 'applied';
    proposal.applied_at = Date.now();
    this.receipts?.append({
      kind: 'failure_fix_applied', ref: sig, agent: 'system',
      meta: { strategy: proposal.strategy },
    });
    return { ok: true, sig, proposal };
  }

  dismiss(sig) {
    const proposal = this.proposals.find(p => p.sig === sig);
    if (!proposal) return { ok: false, reason: 'PROPOSAL_NOT_FOUND' };
    proposal.status = 'dismissed';
    return { ok: true, sig };
  }

  list({ pattern_only = false, with_proposals = false, limit = 50 } = {}) {
    let arr = [...this.buckets.values()];
    if (pattern_only) arr = arr.filter(b => b.pattern_detected);
    if (with_proposals) arr = arr.filter(b => b.fix_proposed && !b.fix_applied);
    return arr.sort((a, b) => b.last_seen - a.last_seen).slice(0, limit)
      .map(b => ({
        sig: b.sig, kind: b.kind, reason: b.reason, skill: b.skill,
        count: b.count, first_seen: b.first_seen, last_seen: b.last_seen,
        pattern_detected: b.pattern_detected, fix_proposed: b.fix_proposed,
        fix_applied: b.fix_applied,
      }));
  }

  get(sig) {
    const b = this.buckets.get(sig);
    if (!b) return { ok: false, reason: 'NOT_FOUND' };
    const proposal = this.proposals.find(p => p.sig === sig);
    return { ok: true, bucket: b, proposal: proposal || null };
  }

  stats() {
    const list = [...this.buckets.values()];
    const total_failures = list.reduce((s, b) => s + b.count, 0);
    return {
      total_buckets: list.length,
      total_failures,
      patterns_detected: list.filter(b => b.pattern_detected).length,
      fixes_proposed:    list.filter(b => b.fix_proposed).length,
      fixes_applied:     list.filter(b => b.fix_applied).length,
      by_kind: list.reduce((a, b) => { a[b.kind] = (a[b.kind] || 0) + b.count; return a; }, {}),
      top_recurring: list.sort((a, b) => b.count - a.count).slice(0, 5)
        .map(b => ({ sig: b.sig, kind: b.kind, reason: b.reason, count: b.count })),
    };
  }
}

/** @typedef {{sig:string,kind:string,reason:string,skill:string|null,count:number,first_seen:number,last_seen:number,contexts:object[],pattern_detected:boolean,fix_proposed:boolean,fix_applied:boolean}} FailureBucket */
