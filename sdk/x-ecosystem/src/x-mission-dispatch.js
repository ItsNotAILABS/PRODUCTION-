import crypto from 'node:crypto';

export const X_MISSION_TYPES = Object.freeze({
  // Git ecosystem
  GIT_SCAN:             'git:scan',
  GIT_TRACE:            'git:trace',
  GIT_DIGEST:           'git:digest',
  GIT_AUDIT_PROTOCOLS:  'git:audit-protocols',
  GIT_AUDIT_GOVERNANCE: 'git:audit-governance',
  GIT_ENTRY_SURFACE:    'git:entry-surface',
  GIT_EXTRACT_SCHEMAS:  'git:extract-schemas',
  GIT_DETECT_MISSIONS:  'git:detect-missions',
  GIT_CONTRIBUTOR_MAP:  'git:contributor-map',
  GIT_SDK_SURFACE:      'git:sdk-surface',
  // Commerce intelligence
  COMMERCE_SYNC:        'commerce:sync',
  COMMERCE_FORECAST:    'commerce:forecast',
  COMMERCE_ANOMALY:     'commerce:anomaly',
  COMMERCE_SEGMENT:     'commerce:segment',
  COMMERCE_OPTIMIZE:    'commerce:optimize',
  // Operational intelligence
  OPS_HEALTH:           'ops:health',
  OPS_AUDIT:            'ops:audit',
  OPS_REPORT:           'ops:report',
  // Research intelligence
  RESEARCH_DIGEST:      'research:digest',
  RESEARCH_SYNTHESIZE:  'research:synthesize',
  // Governance
  GOV_POLICY_CHECK:     'governance:policy-check',
  GOV_AUDIT:            'governance:audit',
  // Protocol execution
  PROTOCOL_EXECUTE:     'protocol:execute',
  // Platform federation
  PLATFORM_PROBE:       'platform:probe',
  PLATFORM_SYNC:        'platform:sync',
});

const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);

/**
 * XMissionDispatch — multi-tenant mission router.
 * Creates, tracks, and executes missions through registered type handlers.
 * Every mission carries: type, tenantId, userId, permissions, context, platform_targets, params.
 */
export class XMissionDispatch {
  #missions = new Map(); // missionId → record
  #handlers = new Map(); // type → async handler(mission)

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------

  /**
   * Register a handler for a mission type.
   * @param {string} type
   * @param {(mission: object) => Promise<object>} handler
   */
  register(type, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for "${type}" must be a function`);
    }
    this.#handlers.set(type, handler);
  }

  /** @returns {string[]} Registered mission types */
  get registeredTypes() { return [...this.#handlers.keys()]; }

  // ---------------------------------------------------------------------------
  // Mission lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a mission record (does not execute it).
   * @param {{
   *   type:              string,
   *   tenant:            import('./x-tenant.js').XTenant,
   *   params?:           object,
   *   platform_targets?: string[],
   *   tags?:             string[],
   *   priority?:         'low'|'normal'|'high'|'critical',
   * }} opts
   * @returns {object}
   */
  create({ type, tenant, params = {}, platform_targets = [], tags = [], priority = 'normal' }) {
    if (!type)   throw new TypeError('Mission type is required');
    if (!tenant) throw new TypeError('Tenant context is required');
    if (!VALID_PRIORITIES.has(priority)) {
      throw new RangeError(`priority must be one of: ${[...VALID_PRIORITIES].join(', ')}`);
    }

    const missionId = crypto.randomUUID();
    const mission = {
      missionId,
      type,
      tenantId:         tenant.tenantId,
      userId:           tenant.userId,
      permissions:      tenant.permissions,
      context:          tenant.context,
      platform_targets: [...platform_targets],
      params:           { ...params },
      tags:             [...tags],
      priority,
      status:           'pending',
      createdAt:        new Date().toISOString(),
      startedAt:        null,
      completedAt:      null,
      durationMs:       null,
      result:           null,
      error:            null,
    };

    this.#missions.set(missionId, mission);
    return mission;
  }

  /**
   * Execute a mission through its registered handler.
   * @param {string} missionId
   * @returns {Promise<object>} The completed mission record
   */
  async execute(missionId) {
    const mission = this.#missions.get(missionId);
    if (!mission) throw new Error(`Mission "${missionId}" not found`);

    const handler = this.#handlers.get(mission.type);
    if (!handler) throw new Error(`No handler registered for mission type "${mission.type}"`);

    mission.status    = 'running';
    mission.startedAt = new Date().toISOString();
    const t0 = Date.now();

    try {
      mission.result      = await handler(mission);
      mission.status      = 'completed';
      mission.completedAt = new Date().toISOString();
      mission.durationMs  = Date.now() - t0;
      return mission;
    } catch (err) {
      mission.status      = 'failed';
      mission.error       = err.message;
      mission.completedAt = new Date().toISOString();
      mission.durationMs  = Date.now() - t0;
      throw err;
    }
  }

  /**
   * Create and immediately execute a mission in one call.
   * @param {Parameters<XMissionDispatch['create']>[0]} opts
   * @returns {Promise<object>}
   */
  async run(opts) {
    const mission = this.create(opts);
    return this.execute(mission.missionId);
  }

  /** @returns {object|null} */
  get(missionId) { return this.#missions.get(missionId) ?? null; }

  /**
   * @param {{ tenantId?: string, status?: string, limit?: number }} [filter]
   * @returns {object[]}
   */
  list({ tenantId, status, limit = 100 } = {}) {
    let results = [...this.#missions.values()];
    if (tenantId) results = results.filter((m) => m.tenantId === tenantId);
    if (status)   results = results.filter((m) => m.status === status);
    return results.slice(-limit);
  }

  /** @returns {{ total: number, pending: number, running: number, completed: number, failed: number }} */
  stats() {
    const all = [...this.#missions.values()];
    return {
      total:     all.length,
      pending:   all.filter((m) => m.status === 'pending').length,
      running:   all.filter((m) => m.status === 'running').length,
      completed: all.filter((m) => m.status === 'completed').length,
      failed:    all.filter((m) => m.status === 'failed').length,
    };
  }

  static get types() { return Object.values(X_MISSION_TYPES); }
}

export default XMissionDispatch;
