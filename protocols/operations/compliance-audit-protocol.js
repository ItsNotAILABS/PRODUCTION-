/**
 * PROTO-O006: Compliance Audit Protocol (CAP)
 * Derives from: EthicalGovernanceProtocol, TrustVerificationProtocol
 * Immutable audit trail, compliance rule evaluation, and evidence packaging.
 */

import { createHash } from 'crypto';

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const AUDIT_SEVERITY = Object.freeze({
  INFO:     'info',
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
});

export const COMPLIANCE_STATUS = Object.freeze({
  COMPLIANT:     'compliant',
  NON_COMPLIANT: 'non_compliant',
  PENDING:       'pending',
  EXEMPT:        'exempt',
});

export class ComplianceAuditProtocol {
  constructor(config = {}) {
    this.version         = '1.0.0';
    this.domain          = 'operations';
    this.retainDays      = config.retainDays ?? 365;
    this.metrics         = { eventsLogged: 0, rulesEvaluated: 0, violations: 0, reportsGenerated: 0 };
    this.#trail          = [];      // hash-chained audit entries
    this.#rules          = new Map();
    this.#prevHash       = '0'.repeat(64);
  }

  #trail;
  #rules;
  #prevHash;

  /**
   * Register a compliance rule.
   * @param {{ id: string, name: string, description: string, severity: string, check: (event: object) => boolean }} rule
   */
  registerRule(rule) {
    this.#rules.set(rule.id, rule);
  }

  /**
   * Log an auditable event to the immutable trail.
   * @param {{ actor: string, action: string, resource: string, outcome: 'success'|'failure', meta?: object }} event
   * @returns {{ entryId: string, hash: string }}
   */
  log(event) {
    const entry = {
      id:        `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ...event,
      ts:        new Date().toISOString(),
      prevHash:  this.#prevHash,
      meta:      event.meta ?? {},
    };
    const hash       = this.#hashEntry(entry);
    entry.hash       = hash;
    this.#prevHash   = hash;
    this.#trail.push(entry);
    this.metrics.eventsLogged++;

    // Auto-evaluate rules on every logged event
    this.#autoEvaluate(entry);

    return { entryId: entry.id, hash };
  }

  /**
   * Evaluate all rules against a given event.
   * @param {object} event
   * @returns {{ ruleId: string, name: string, status: string, severity: string }[]}
   */
  evaluate(event) {
    const results = [];
    for (const [id, rule] of this.#rules.entries()) {
      this.metrics.rulesEvaluated++;
      let pass = false;
      try { pass = rule.check(event); } catch { pass = false; }
      const status = pass ? COMPLIANCE_STATUS.COMPLIANT : COMPLIANCE_STATUS.NON_COMPLIANT;
      if (!pass) this.metrics.violations++;
      results.push({ ruleId: id, name: rule.name, status, severity: rule.severity });
    }
    return results;
  }

  /**
   * Verify the hash chain integrity.
   * @returns {{ valid: boolean, entries: number, firstBroken?: string }}
   */
  verifyChain() {
    let prev = '0'.repeat(64);
    for (const entry of this.#trail) {
      const { hash, ...rest } = entry;
      const expected = this.#hashEntry({ ...rest, prevHash: prev });
      if (expected !== hash) return { valid: false, entries: this.#trail.length, firstBroken: entry.id };
      prev = hash;
    }
    return { valid: true, entries: this.#trail.length };
  }

  /**
   * Generate a compliance report for a time window.
   * @param {{ fromTs?: string, toTs?: string, actor?: string }} filter
   * @returns {{ period: object, events: number, violations: number, score: number, entries: object[], rulesSummary: object[] }}
   */
  generateReport(filter = {}) {
    const { fromTs, toTs, actor } = filter;
    const from = fromTs ? new Date(fromTs).getTime() : 0;
    const to   = toTs   ? new Date(toTs).getTime()   : Date.now();

    const entries = this.#trail.filter((e) => {
      const t = new Date(e.ts).getTime();
      return t >= from && t <= to && (!actor || e.actor === actor);
    });

    const violations = entries.flatMap((e) => this.evaluate(e).filter((r) => r.status === COMPLIANCE_STATUS.NON_COMPLIANT));
    const score      = entries.length === 0 ? 1 : Math.max(0, 1 - (violations.length / (entries.length * this.#rules.size || 1)) * PHI);

    const rulesSummary = [...this.#rules.values()].map((r) => {
      const fails = violations.filter((v) => v.ruleId === r.id).length;
      return { ruleId: r.id, name: r.name, severity: r.severity, violations: fails };
    });

    this.metrics.reportsGenerated++;
    return {
      period:       { from: fromTs ?? 'all', to: toTs ?? 'now' },
      events:       entries.length,
      violations:   violations.length,
      score:        Math.round(score * 1000) / 1000,
      entries,
      rulesSummary,
    };
  }

  /**
   * Query audit trail entries.
   * @param {{ actor?: string, action?: string, limit?: number }} filter
   */
  query({ actor, action, limit = 100 } = {}) {
    return this.#trail
      .filter((e) => (!actor || e.actor === actor) && (!action || e.action === action))
      .slice(-limit);
  }

  #hashEntry(entry) {
    const data = JSON.stringify({ prevHash: entry.prevHash, actor: entry.actor, action: entry.action, resource: entry.resource, outcome: entry.outcome, ts: entry.ts });
    return createHash('sha256').update(data).digest('hex');
  }

  #autoEvaluate(entry) {
    for (const rule of this.#rules.values()) {
      this.metrics.rulesEvaluated++;
      try { if (!rule.check(entry)) this.metrics.violations++; } catch { this.metrics.violations++; }
    }
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default ComplianceAuditProtocol;
