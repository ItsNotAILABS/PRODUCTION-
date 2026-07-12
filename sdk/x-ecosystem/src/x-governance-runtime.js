import crypto from 'node:crypto';

/**
 * XGovernanceRuntime — SHA-256 hash-chained audit log and policy gate for the X ecosystem.
 * Every mission passes through enforce() before execution.
 * The audit chain is append-only; verifyChain() detects any tampering.
 */
export class XGovernanceRuntime {
  #auditChain = [];
  #lastHash = '0'.repeat(64); // genesis hash
  #rateLimits = new Map();    // tenantId → { count, windowStart }
  #maxAuditEntries;
  #rateLimitWindowMs;
  #rateLimitMaxRequests;
  #policies = [];             // Array<(mission) => string|null>

  /**
   * @param {{ maxAuditEntries?: number, rateLimitWindowMs?: number, rateLimitMaxRequests?: number }} opts
   */
  constructor({ maxAuditEntries = 10_000, rateLimitWindowMs = 60_000, rateLimitMaxRequests = 1000 } = {}) {
    this.#maxAuditEntries      = maxAuditEntries;
    this.#rateLimitWindowMs    = rateLimitWindowMs;
    this.#rateLimitMaxRequests = rateLimitMaxRequests;

    // Built-in policies — order matters
    this.#policies.push(
      this.#policyTenantIsolation.bind(this),
      this.#policyRateLimit.bind(this),
      this.#policyPermissions.bind(this),
    );
  }

  // ---------------------------------------------------------------------------
  // Gate
  // ---------------------------------------------------------------------------

  /**
   * Run all registered policies against a mission. Throws on first rejection.
   * @param {{ missionId: string, type: string, tenant: import('./x-tenant.js').XTenant, platforms: string[] }} mission
   */
  enforce(mission) {
    for (const policy of this.#policies) {
      const rejection = policy(mission);
      if (rejection) {
        this.#append('policy-rejected', mission, { reason: rejection });
        throw new Error(`X governance: mission rejected — ${rejection}`);
      }
    }
    this.#append('mission-allowed', mission, {});
  }

  /**
   * Add a custom policy function. Return null to pass, a string to reject.
   * @param {(mission: object) => string|null} fn
   */
  addPolicy(fn) {
    if (typeof fn !== 'function') throw new TypeError('Policy must be a function');
    this.#policies.push(fn);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  /**
   * Append an arbitrary event to the audit chain.
   * @param {string} event
   * @param {object} [subject]
   * @param {object} [meta]
   */
  audit(event, subject = {}, meta = {}) {
    this.#append(event, subject, meta);
  }

  /** @returns {object[]} Immutable copy of the full audit chain */
  getAuditChain() {
    return [...this.#auditChain];
  }

  /**
   * Verify SHA-256 hash chain integrity.
   * @returns {{ valid: boolean, entries: number, firstBroken?: number }}
   */
  verifyChain() {
    let prev = '0'.repeat(64);
    for (let i = 0; i < this.#auditChain.length; i++) {
      const { hash, prevHash, ...rest } = this.#auditChain[i];
      if (prevHash !== prev) return { valid: false, entries: this.#auditChain.length, firstBroken: i };
      const expected = this.#sha256(JSON.stringify({ ...rest, prevHash }));
      if (hash !== expected) return { valid: false, entries: this.#auditChain.length, firstBroken: i };
      prev = hash;
    }
    return { valid: true, entries: this.#auditChain.length };
  }

  /** Reset per-tenant rate counters (e.g. for testing). */
  resetRateLimits() {
    this.#rateLimits.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #append(event, subject, meta) {
    if (this.#auditChain.length >= this.#maxAuditEntries) this.#auditChain.shift();
    const body = {
      event,
      tenantId:  subject?.tenant?.tenantId ?? subject?.tenantId ?? null,
      userId:    subject?.tenant?.userId   ?? subject?.userId   ?? null,
      missionId: subject?.missionId ?? null,
      type:      subject?.type ?? null,
      meta,
      timestamp: new Date().toISOString(),
      prevHash:  this.#lastHash,
    };
    const hash  = this.#sha256(JSON.stringify(body));
    this.#auditChain.push({ ...body, hash });
    this.#lastHash = hash;
  }

  #policyTenantIsolation(mission) {
    if (!mission.tenant)           return 'no tenant context on mission';
    if (!mission.tenant.tenantId)  return 'tenant missing tenantId';
    return null;
  }

  #policyRateLimit(mission) {
    const key = mission.tenant?.tenantId;
    if (!key) return null;
    const now = Date.now();
    let record = this.#rateLimits.get(key);
    if (!record || now - record.windowStart > this.#rateLimitWindowMs) {
      record = { count: 0, windowStart: now };
    }
    record.count++;
    this.#rateLimits.set(key, record);
    if (record.count > this.#rateLimitMaxRequests) {
      return `rate limit exceeded for tenant "${key}" (${record.count}/${this.#rateLimitMaxRequests} per window)`;
    }
    return null;
  }

  #policyPermissions(mission) {
    const { tenant, platforms = [] } = mission;
    if (!tenant) return null;
    if (!tenant.hasPermission('mission:execute')) {
      return `tenant "${tenant.tenantId}" lacks permission: mission:execute`;
    }
    for (const platform of platforms) {
      if (!tenant.canAccessPlatform(platform)) {
        return `tenant "${tenant.tenantId}" cannot access platform: "${platform}"`;
      }
    }
    return null;
  }

  #sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
  }
}

export default XGovernanceRuntime;
