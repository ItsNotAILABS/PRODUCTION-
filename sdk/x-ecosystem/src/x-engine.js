import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { XEcosystemConfig } from './x-config.js';
import { XTenant } from './x-tenant.js';
import { XGovernanceRuntime } from './x-governance-runtime.js';
import { XProtocolRegistry } from './x-protocol-registry.js';
import { XPlatformRegistry } from './x-platform-registry.js';
import { XMicrobotOrchestrator } from './x-microbot-orchestrator.js';
import { XMissionDispatch, X_MISSION_TYPES } from './x-mission-dispatch.js';

/**
 * XEcosystem — sovereign multi-tenant, multi-platform AI orchestration engine.
 *
 * The top-level X ecosystem entry point. Manages tenants, platforms, protocols,
 * microbots, and missions in a single governed runtime with hash-chained audit.
 *
 * Events: 'tenant:created', 'tenant:removed', 'mission:start', 'mission:complete',
 *         'mission:error', 'platform:registered', 'microbot:spawned'
 *
 * Usage:
 *   const x = new XEcosystem();
 *   x.platforms.register('square', squareAdapter, { capabilities: ['payments'] });
 *   x.protocols.registerAll(myProtocols);
 *   const tenant = x.createTenant({ tenantId: 'acme', userId: 'alice', role: 'operator' });
 *   const result = await x.dispatch(tenant, 'commerce:sync', {
 *     platform_targets: ['square'],
 *     params: { locationId: 'L123' },
 *   });
 */
export class XEcosystem extends EventEmitter {
  #engineId;
  #config;
  #governance;
  #protocols;
  #platforms;
  #microbots;
  #dispatch;
  #tenants;
  #startedAt;

  /** @param {{ config?: XEcosystemConfig|object }} [opts] */
  constructor({ config } = {}) {
    super();
    this.#engineId  = crypto.randomUUID();
    this.#config    = config instanceof XEcosystemConfig
      ? config
      : XEcosystemConfig.from(config ?? {});
    this.#startedAt = new Date().toISOString();

    this.#governance = new XGovernanceRuntime({
      maxAuditEntries:      this.#config.auditLogMaxEntries,
      rateLimitWindowMs:    this.#config.rateLimitWindowMs,
      rateLimitMaxRequests: this.#config.rateLimitMaxRequests,
    });

    this.#protocols = new XProtocolRegistry();
    this.#platforms = new XPlatformRegistry();
    this.#microbots = new XMicrobotOrchestrator();
    this.#dispatch  = new XMissionDispatch();
    this.#tenants   = new Map();
  }

  // ---------------------------------------------------------------------------
  // Sub-system accessors (read-only facades)
  // ---------------------------------------------------------------------------

  /** @returns {XProtocolRegistry} */
  get protocols()  { return this.#protocols; }

  /** @returns {XPlatformRegistry} */
  get platforms()  { return this.#platforms; }

  /** @returns {XMicrobotOrchestrator} */
  get microbots()  { return this.#microbots; }

  /** @returns {XGovernanceRuntime} */
  get governance() { return this.#governance; }

  /** @returns {XEcosystemConfig} */
  get config()     { return this.#config; }

  // ---------------------------------------------------------------------------
  // Tenant management
  // ---------------------------------------------------------------------------

  /**
   * Create and register a tenant.
   * @param {ConstructorParameters<typeof XTenant>[0]} opts
   * @returns {XTenant}
   */
  createTenant(opts = {}) {
    if (this.#tenants.size >= this.#config.maxTenantsPerInstance) {
      throw new Error(`XEcosystem: max tenants reached (${this.#config.maxTenantsPerInstance})`);
    }
    const tenant = new XTenant(opts);
    this.#tenants.set(tenant.tenantId, tenant);
    this.#governance.audit('tenant-created', { tenantId: tenant.tenantId, userId: tenant.userId }, {});
    this.emit('tenant:created', { engineId: this.#engineId, tenantId: tenant.tenantId, userId: tenant.userId });
    return tenant;
  }

  /**
   * Retrieve a registered tenant by id.
   * @param {string} tenantId
   * @returns {XTenant}
   */
  getTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId);
    if (!tenant) throw new Error(`XEcosystem: tenant "${tenantId}" not found`);
    return tenant;
  }

  /**
   * Remove a tenant from the registry.
   * @param {string} tenantId
   */
  removeTenant(tenantId) {
    this.#tenants.delete(tenantId);
    this.#governance.audit('tenant-removed', { tenantId }, {});
    this.emit('tenant:removed', { engineId: this.#engineId, tenantId });
  }

  // ---------------------------------------------------------------------------
  // Mission handlers
  // ---------------------------------------------------------------------------

  /**
   * Register a handler for a mission type.
   * @param {string} type - One of X_MISSION_TYPES.*
   * @param {(mission: object) => Promise<object>} handler
   */
  registerMissionHandler(type, handler) {
    this.#dispatch.register(type, handler);
  }

  // ---------------------------------------------------------------------------
  // Mission dispatch
  // ---------------------------------------------------------------------------

  /**
   * Execute a mission on behalf of a tenant.
   * Governance gate runs before execution; events emitted throughout.
   *
   * @param {XTenant} tenant
   * @param {string} type - One of X_MISSION_TYPES.*
   * @param {{
   *   params?:           object,
   *   platform_targets?: string[],
   *   tags?:             string[],
   *   priority?:         'low'|'normal'|'high'|'critical',
   * }} [opts]
   * @returns {Promise<object>} Completed mission record (includes .result)
   */
  async dispatch(tenant, type, { params = {}, platform_targets = [], tags = [], priority = 'normal' } = {}) {
    const mission = this.#dispatch.create({ type, tenant, params, platform_targets, tags, priority });

    if (this.#config.enableGovernance) {
      this.#governance.enforce({ ...mission, tenant, platforms: platform_targets });
    }

    this.emit('mission:start', {
      engineId:  this.#engineId,
      missionId: mission.missionId,
      type,
      tenantId:  tenant.tenantId,
    });

    try {
      const completed = await this.#dispatch.execute(mission.missionId);
      if (this.#config.enableAudit) {
        this.#governance.audit('mission-completed', mission, { durationMs: completed.durationMs });
      }
      this.emit('mission:complete', {
        engineId:   this.#engineId,
        missionId:  completed.missionId,
        type,
        tenantId:   tenant.tenantId,
        durationMs: completed.durationMs,
      });
      return completed;
    } catch (err) {
      if (this.#config.enableAudit) {
        this.#governance.audit('mission-failed', mission, { error: err.message });
      }
      this.emit('mission:error', {
        engineId:  this.#engineId,
        missionId: mission.missionId,
        type,
        tenantId:  tenant.tenantId,
        error:     err.message,
      });
      throw err;
    }
  }

  /**
   * Convenience: fan out the same mission across multiple tenants in parallel.
   * @param {XTenant[]} tenants
   * @param {string} type
   * @param {object} [opts]
   * @returns {Promise<Array<{ tenantId: string, success: boolean, result?: object, error?: string }>>}
   */
  async dispatchAll(tenants, type, opts = {}) {
    const settled = await Promise.allSettled(tenants.map((t) => this.dispatch(t, type, opts)));
    return settled.map((r, i) => ({
      tenantId: tenants[i].tenantId,
      success:  r.status === 'fulfilled',
      result:   r.status === 'fulfilled' ? r.value : undefined,
      error:    r.status === 'rejected'  ? r.reason?.message : undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // Microbot convenience
  // ---------------------------------------------------------------------------

  /**
   * Spawn a microbot scoped to a tenant and track the event.
   * @param {XTenant} tenant
   * @param {object} bot
   * @param {object} [opts]
   * @returns {string} botId
   */
  spawnMicrobot(tenant, bot, opts = {}) {
    const botId = this.#microbots.spawn(bot, { tenantId: tenant.tenantId, ...opts });
    this.emit('microbot:spawned', { engineId: this.#engineId, botId, tenantId: tenant.tenantId });
    return botId;
  }

  // ---------------------------------------------------------------------------
  // Observability
  // ---------------------------------------------------------------------------

  /**
   * Full ecosystem status snapshot.
   * @returns {object}
   */
  status() {
    return {
      engineId:   this.#engineId,
      startedAt:  this.#startedAt,
      tenants:    this.#tenants.size,
      platforms:  this.#platforms.list().length,
      protocols:  this.#protocols.stats(),
      microbots:  this.#microbots.status(),
      missions:   this.#dispatch.stats(),
      auditChain: this.#governance.getAuditChain().length,
    };
  }

  /**
   * @param {{ tenantId?: string, status?: string, limit?: number }} [filter]
   * @returns {object[]}
   */
  listMissions(filter = {}) {
    return this.#dispatch.list(filter);
  }

  /** Clean up listeners. Call when discarding the engine. */
  destroy() {
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Static
  // ---------------------------------------------------------------------------

  /** @returns {typeof X_MISSION_TYPES} */
  static get missionTypes() { return X_MISSION_TYPES; }

  /** @returns {typeof import('./x-tenant.js').X_PERMISSIONS} */
  static get permissions() { return XTenant.PERMISSIONS; }

  /** @returns {typeof XTenant.ROLES} */
  static get roles() { return XTenant.ROLES; }
}

export default XEcosystem;
