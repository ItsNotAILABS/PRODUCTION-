/**
 * GitEngineConfig — validated configuration schema for the Git Knowledge Engine.
 * All limits, timeouts, and feature flags live here.
 * Construct once at startup; the engine, indexer, and executor read from it.
 */
export class GitEngineConfig {
  /**
   * @param {object} [overrides]
   * @param {number}  [overrides.maxFileSizeBytes=512000]   Skip files larger than this
   * @param {number}  [overrides.maxGraphNodes=50000]       Hard cap on knowledge graph nodes
   * @param {number}  [overrides.maxCommits=200]            Commits fetched from git log
   * @param {number}  [overrides.maxKeyFiles=15]            Key files read into memory
   * @param {number}  [overrides.gitTimeoutMs=15000]        Timeout for each git CLI call
   * @param {number}  [overrides.missionTimeoutMs=30000]    Hard timeout per mission
   * @param {number}  [overrides.cacheTtlMs=300000]         Result cache TTL (5 min default)
   * @param {number}  [overrides.maxConcurrentMissions=8]   Mission queue concurrency
   * @param {number}  [overrides.maxQueueDepth=64]          Mission queue maximum depth
   * @param {number}  [overrides.walkerMaxDepth=12]         File walker maximum directory depth
   * @param {string[]} [overrides.ignorePatterns]           Extra dir/file patterns to skip
   * @param {boolean} [overrides.enableIncrementalIndex=true]  Re-use fingerprints across index()
   * @param {boolean} [overrides.enableMetrics=true]        Collect operation metrics
   * @param {boolean} [overrides.enableCache=true]          Cache mission results by type
   * @param {string}  [overrides.logLevel='warn']           'debug'|'info'|'warn'|'error'|'off'
   */
  constructor(overrides = {}) {
    const raw = { ...GitEngineConfig.DEFAULTS, ...overrides };
    this.#validate(raw);

    this.maxFileSizeBytes        = raw.maxFileSizeBytes;
    this.maxGraphNodes           = raw.maxGraphNodes;
    this.maxCommits              = raw.maxCommits;
    this.maxKeyFiles             = raw.maxKeyFiles;
    this.gitTimeoutMs            = raw.gitTimeoutMs;
    this.missionTimeoutMs        = raw.missionTimeoutMs;
    this.cacheTtlMs              = raw.cacheTtlMs;
    this.maxConcurrentMissions   = raw.maxConcurrentMissions;
    this.maxQueueDepth           = raw.maxQueueDepth;
    this.walkerMaxDepth          = raw.walkerMaxDepth;
    this.ignorePatterns          = Array.isArray(raw.ignorePatterns) ? raw.ignorePatterns : [];
    this.enableIncrementalIndex  = !!raw.enableIncrementalIndex;
    this.enableMetrics           = !!raw.enableMetrics;
    this.enableCache             = !!raw.enableCache;
    this.logLevel                = raw.logLevel;

    Object.freeze(this);
  }

  /**
   * Create from a plain object, merging with defaults.
   * @param {object} [obj]
   * @returns {GitEngineConfig}
   */
  static from(obj = {}) {
    return new GitEngineConfig(obj);
  }

  /** @returns {object} */
  toJSON() {
    return {
      maxFileSizeBytes:      this.maxFileSizeBytes,
      maxGraphNodes:         this.maxGraphNodes,
      maxCommits:            this.maxCommits,
      maxKeyFiles:           this.maxKeyFiles,
      gitTimeoutMs:          this.gitTimeoutMs,
      missionTimeoutMs:      this.missionTimeoutMs,
      cacheTtlMs:            this.cacheTtlMs,
      maxConcurrentMissions: this.maxConcurrentMissions,
      maxQueueDepth:         this.maxQueueDepth,
      walkerMaxDepth:        this.walkerMaxDepth,
      ignorePatterns:        this.ignorePatterns,
      enableIncrementalIndex: this.enableIncrementalIndex,
      enableMetrics:         this.enableMetrics,
      enableCache:           this.enableCache,
      logLevel:              this.logLevel,
    };
  }

  static get DEFAULTS() {
    return Object.freeze({
      maxFileSizeBytes:        512_000,
      maxGraphNodes:           50_000,
      maxCommits:              200,
      maxKeyFiles:             15,
      gitTimeoutMs:            15_000,
      missionTimeoutMs:        30_000,
      cacheTtlMs:              300_000,
      maxConcurrentMissions:   8,
      maxQueueDepth:           64,
      walkerMaxDepth:          12,
      ignorePatterns:          [],
      enableIncrementalIndex:  true,
      enableMetrics:           true,
      enableCache:             true,
      logLevel:                'warn',
    });
  }

  #validate(raw) {
    const posInt = (key) => {
      const v = raw[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
        throw new RangeError(`GitEngineConfig: "${key}" must be a positive integer, got ${v}`);
      }
    };

    ['maxFileSizeBytes', 'maxGraphNodes', 'maxCommits', 'maxKeyFiles',
     'gitTimeoutMs', 'missionTimeoutMs', 'cacheTtlMs',
     'maxConcurrentMissions', 'maxQueueDepth', 'walkerMaxDepth'].forEach(posInt);

    const levels = new Set(['debug', 'info', 'warn', 'error', 'off']);
    if (!levels.has(raw.logLevel)) {
      throw new RangeError(`GitEngineConfig: "logLevel" must be one of ${[...levels].join(', ')}`);
    }
  }
}

export default GitEngineConfig;
