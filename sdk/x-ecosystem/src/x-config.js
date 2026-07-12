const DEFAULTS = Object.freeze({
  maxTenantsPerInstance:  1000,
  maxMissionsPerTenant:   100,
  maxConcurrentMissions:  32,
  missionTimeoutMs:       60_000,
  auditLogMaxEntries:     10_000,
  rateLimitWindowMs:      60_000,
  rateLimitMaxRequests:   1000,
  enableGovernance:       true,
  enableMetrics:          true,
  enableAudit:            true,
  enableCache:            true,
  cacheTtlMs:             300_000,
  logLevel:               'warn',
});

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent']);

export class XEcosystemConfig {
  #maxTenantsPerInstance;
  #maxMissionsPerTenant;
  #maxConcurrentMissions;
  #missionTimeoutMs;
  #auditLogMaxEntries;
  #rateLimitWindowMs;
  #rateLimitMaxRequests;
  #enableGovernance;
  #enableMetrics;
  #enableAudit;
  #enableCache;
  #cacheTtlMs;
  #logLevel;

  constructor(opts = {}) {
    const d = DEFAULTS;
    this.#maxTenantsPerInstance  = opts.maxTenantsPerInstance  ?? d.maxTenantsPerInstance;
    this.#maxMissionsPerTenant   = opts.maxMissionsPerTenant   ?? d.maxMissionsPerTenant;
    this.#maxConcurrentMissions  = opts.maxConcurrentMissions  ?? d.maxConcurrentMissions;
    this.#missionTimeoutMs       = opts.missionTimeoutMs       ?? d.missionTimeoutMs;
    this.#auditLogMaxEntries     = opts.auditLogMaxEntries     ?? d.auditLogMaxEntries;
    this.#rateLimitWindowMs      = opts.rateLimitWindowMs      ?? d.rateLimitWindowMs;
    this.#rateLimitMaxRequests   = opts.rateLimitMaxRequests   ?? d.rateLimitMaxRequests;
    this.#enableGovernance       = opts.enableGovernance       ?? d.enableGovernance;
    this.#enableMetrics          = opts.enableMetrics          ?? d.enableMetrics;
    this.#enableAudit            = opts.enableAudit            ?? d.enableAudit;
    this.#enableCache            = opts.enableCache            ?? d.enableCache;
    this.#cacheTtlMs             = opts.cacheTtlMs             ?? d.cacheTtlMs;
    this.#logLevel               = opts.logLevel               ?? d.logLevel;
    this.#validate();
    Object.freeze(this);
  }

  get maxTenantsPerInstance()  { return this.#maxTenantsPerInstance; }
  get maxMissionsPerTenant()   { return this.#maxMissionsPerTenant; }
  get maxConcurrentMissions()  { return this.#maxConcurrentMissions; }
  get missionTimeoutMs()       { return this.#missionTimeoutMs; }
  get auditLogMaxEntries()     { return this.#auditLogMaxEntries; }
  get rateLimitWindowMs()      { return this.#rateLimitWindowMs; }
  get rateLimitMaxRequests()   { return this.#rateLimitMaxRequests; }
  get enableGovernance()       { return this.#enableGovernance; }
  get enableMetrics()          { return this.#enableMetrics; }
  get enableAudit()            { return this.#enableAudit; }
  get enableCache()            { return this.#enableCache; }
  get cacheTtlMs()             { return this.#cacheTtlMs; }
  get logLevel()               { return this.#logLevel; }

  static get DEFAULTS() { return DEFAULTS; }
  static from(opts = {}) { return new XEcosystemConfig(opts); }

  #validate() {
    if (this.#maxTenantsPerInstance < 1)
      throw new RangeError('maxTenantsPerInstance must be >= 1');
    if (this.#maxConcurrentMissions < 1)
      throw new RangeError('maxConcurrentMissions must be >= 1');
    if (this.#missionTimeoutMs < 1000)
      throw new RangeError('missionTimeoutMs must be >= 1000');
    if (!VALID_LOG_LEVELS.has(this.#logLevel))
      throw new RangeError(`logLevel must be one of: ${[...VALID_LOG_LEVELS].join(', ')}`);
  }

  toJSON() {
    return {
      maxTenantsPerInstance: this.#maxTenantsPerInstance,
      maxMissionsPerTenant:  this.#maxMissionsPerTenant,
      maxConcurrentMissions: this.#maxConcurrentMissions,
      missionTimeoutMs:      this.#missionTimeoutMs,
      auditLogMaxEntries:    this.#auditLogMaxEntries,
      rateLimitWindowMs:     this.#rateLimitWindowMs,
      rateLimitMaxRequests:  this.#rateLimitMaxRequests,
      enableGovernance:      this.#enableGovernance,
      enableMetrics:         this.#enableMetrics,
      enableAudit:           this.#enableAudit,
      enableCache:           this.#enableCache,
      cacheTtlMs:            this.#cacheTtlMs,
      logLevel:              this.#logLevel,
    };
  }
}

export default XEcosystemConfig;
