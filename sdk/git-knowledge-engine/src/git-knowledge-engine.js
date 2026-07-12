import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { GitIndexer } from './git-indexer.js';
import { GitKnowledgeGraph } from './git-knowledge-graph.js';
import { GitMissionRouter, MISSION_TYPES } from './git-mission-router.js';
import { GitExecutor } from './git-executor.js';
import { GitEngineConfig } from './git-config.js';
import { GitCache } from './git-cache.js';
import { GitMetrics } from './git-metrics.js';
import { GitMissionQueue } from './git-mission-queue.js';

/**
 * GitKnowledgeEngine — sovereign knowledge and execution engine for Git repositories.
 * The X ecosystem entry point: index any local Git repo into a typed knowledge graph,
 * then dispatch missions through the X protocol layer.
 *
 * Extends EventEmitter — listen to 'indexed', 'mission:start', 'mission:complete',
 * 'mission:error', and 'audit' events for observability hooks.
 *
 * Usage:
 *   const engine = await GitKnowledgeEngine.fromPath('/path/to/repo');
 *   const digest = await engine.digest();
 *
 * With full config:
 *   const engine = await GitKnowledgeEngine.fromPath('/path/to/repo', {
 *     tenantId: 'acme',
 *     userId:   'alice',
 *     config:   { cacheTtlMs: 60_000, maxConcurrentMissions: 4 },
 *   });
 */
export class GitKnowledgeEngine extends EventEmitter {
  /** @type {GitIndexer} */
  #indexer;

  /** @type {GitKnowledgeGraph} */
  #graph;

  /** @type {GitMissionRouter} */
  #router;

  /** @type {GitExecutor | null} */
  #executor = null;

  /** @type {GitEngineConfig} */
  #config;

  /** @type {GitCache} */
  #cache;

  /** @type {GitMetrics} */
  #metrics;

  /** @type {GitMissionQueue} */
  #queue;

  /** @type {object | null} */
  #rawIndex = null;

  /** @type {string} */
  #engineId;

  /** @type {{ tenantId: string, userId: string }} */
  #context;

  /** @type {object[]} Append-only, capped at 500 entries */
  #auditLog = [];

  /**
   * Fingerprint map for incremental indexing: relPath → { size, mtime }
   * @type {Map<string, { size: number, mtime: number }>}
   */
  #fingerprints = new Map();

  /**
   * @param {GitIndexer} indexer
   * @param {{ tenantId?: string, userId?: string, config?: GitEngineConfig|object }} [opts]
   */
  constructor(indexer, { tenantId = 'default', userId = 'system', config } = {}) {
    super();

    this.#indexer  = indexer;
    this.#graph    = new GitKnowledgeGraph();
    this.#router   = new GitMissionRouter();
    this.#engineId = crypto.randomUUID();
    this.#context  = { tenantId, userId };

    this.#config  = config instanceof GitEngineConfig
      ? config
      : GitEngineConfig.from(config ?? {});

    this.#cache   = this.#config.enableCache
      ? new GitCache(this.#config.cacheTtlMs)
      : new NullCache();

    this.#metrics = new GitMetrics();

    this.#queue   = new GitMissionQueue({
      maxConcurrent: this.#config.maxConcurrentMissions,
      maxDepth:      this.#config.maxQueueDepth,
      timeoutMs:     this.#config.missionTimeoutMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  /**
   * Create and initialise a GitKnowledgeEngine from a local repo path.
   * @param {string} repoPath - Absolute or relative path to the repository root.
   * @param {{ tenantId?: string, userId?: string, config?: object }} [opts]
   * @returns {Promise<GitKnowledgeEngine>}
   */
  static async fromPath(repoPath, opts = {}) {
    const indexer = new GitIndexer(repoPath);
    const engine  = new GitKnowledgeEngine(indexer, opts);
    await engine.index();
    return engine;
  }

  // ---------------------------------------------------------------------------
  // Indexing
  // ---------------------------------------------------------------------------

  /**
   * Build (or incrementally refresh) the knowledge graph from the repository.
   * Emits 'indexed' when complete.
   * @returns {Promise<{ meta: object, stats: object, incremental: boolean }>}
   */
  async index() {
    return this.#metrics.time('engine.index', async () => {
      const rawIndex = this.#indexer.index();

      // Incremental mode: detect which files changed since last index
      let incremental = false;
      if (this.#config.enableIncrementalIndex && this.#rawIndex) {
        const changedFiles = this.#detectChanges(rawIndex.files);
        if (changedFiles.length === 0) {
          // Nothing changed — skip full rebuild
          this.#metrics.increment('index.skipped');
          return {
            meta:        this.#rawIndex.meta,
            stats:       this.#graph.export().stats,
            incremental: true,
            changed:     0,
          };
        }
        incremental = true;
        this.#metrics.increment('index.incremental');
      } else {
        this.#metrics.increment('index.full');
      }

      // Full (or forced) rebuild
      this.#rawIndex = rawIndex;
      this.#graph    = new GitKnowledgeGraph();
      this.#graph.buildFromIndex(rawIndex);
      this.#executor = null; // reset executor so it picks up the new graph

      // Update fingerprints
      this.#updateFingerprints(rawIndex.files);

      // Invalidate all cached mission results since the graph changed
      if (!incremental) this.#cache.clear();

      const graphExport = this.#graph.export();

      this.#metrics.gauge('graph.nodes', graphExport.stats.totalNodes);
      this.#metrics.gauge('graph.edges', graphExport.stats.totalEdges);
      this.#metrics.gauge('graph.files', rawIndex.meta.totalFiles);

      this.#log('index', null, {
        totalFiles:  rawIndex.meta.totalFiles,
        graphNodes:  graphExport.stats.totalNodes,
        graphEdges:  graphExport.stats.totalEdges,
        incremental,
      });

      this.emit('indexed', {
        engineId:  this.#engineId,
        meta:      rawIndex.meta,
        stats:     graphExport.stats,
        incremental,
      });

      return { meta: rawIndex.meta, stats: graphExport.stats, incremental };
    });
  }

  // ---------------------------------------------------------------------------
  // Mission execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a named mission against the knowledge graph.
   * Results are cached by mission type (TTL from config).
   * Execution is queued to enforce concurrency limits.
   * @param {string} missionType - One of MISSION_TYPES.*
   * @param {{ params?: object, tags?: string[], bypassCache?: boolean }} [opts]
   * @returns {Promise<object>}
   */
  async execute(missionType, opts = {}) {
    this.#requireIndexed();

    const { params = {}, tags = [], bypassCache = false } = opts;
    const cacheKey = GitCache.key(missionType, params);

    // Cache lookup
    if (!bypassCache) {
      const cached = this.#cache.get(cacheKey);
      if (cached) {
        this.#metrics.increment('mission.cache.hit');
        return cached;
      }
    }

    // Enqueue through concurrency gate
    return this.#queue.enqueue(() => this.#runMission(missionType, params, tags, cacheKey));
  }

  async #runMission(missionType, params, tags, cacheKey) {
    if (!this.#executor) {
      this.#executor = new GitExecutor(this.#graph, this.#rawIndex);
    }

    const mission = this.#router.create(missionType, {
      tenantId: this.#context.tenantId,
      userId:   this.#context.userId,
      params,
      tags,
    });

    this.#router.start(mission.id);
    this.#metrics.increment(`mission.${missionType}.started`);
    this.emit('mission:start', { engineId: this.#engineId, missionId: mission.id, type: missionType });

    const t0 = Date.now();
    let result;

    try {
      result = await this.#metrics.time(`mission.${missionType}`, () =>
        this.#executor.execute(mission),
      );

      this.#router.complete(mission.id, result);
      this.#metrics.increment(`mission.${missionType}.completed`);

    } catch (err) {
      this.#router.fail(mission.id, err.message);
      this.#metrics.increment(`mission.${missionType}.failed`);
      this.#log('mission-failed', mission.id, { type: missionType, error: err.message });
      this.emit('mission:error', { engineId: this.#engineId, missionId: mission.id, type: missionType, error: err.message });
      throw err;
    }

    const durationMs = Date.now() - t0;
    this.#log('mission-complete', mission.id, { type: missionType, durationMs });
    this.emit('mission:complete', { engineId: this.#engineId, missionId: mission.id, type: missionType, durationMs });

    const payload = {
      missionId:   mission.id,
      type:        missionType,
      tenantId:    this.#context.tenantId,
      result,
      durationMs,
      completedAt: new Date().toISOString(),
    };

    this.#cache.set(cacheKey, payload);
    return payload;
  }

  // ---------------------------------------------------------------------------
  // Convenience shortcuts
  // ---------------------------------------------------------------------------

  /** @returns {Promise<object>} Full repo scan */
  async scan()             { return this.execute(MISSION_TYPES.SCAN); }

  /** @returns {Promise<object>} Dependency trace + hub scores */
  async trace()            { return this.execute(MISSION_TYPES.TRACE); }

  /** @returns {Promise<object>} Knowledge digest */
  async digest()           { return this.execute(MISSION_TYPES.DIGEST); }

  /** @returns {Promise<object>} Protocol audit */
  async auditProtocols()   { return this.execute(MISSION_TYPES.AUDIT_PROTOCOLS); }

  /** @returns {Promise<object>} Governance audit */
  async auditGovernance()  { return this.execute(MISSION_TYPES.AUDIT_GOVERNANCE); }

  /** @returns {Promise<object>} Entry surface */
  async entrySurface()     { return this.execute(MISSION_TYPES.ENTRY_SURFACE); }

  /** @returns {Promise<object>} Schema extraction */
  async extractSchemas()   { return this.execute(MISSION_TYPES.EXTRACT_SCHEMAS); }

  /** @returns {Promise<object>} Mission detection */
  async detectMissions()   { return this.execute(MISSION_TYPES.DETECT_MISSIONS); }

  /** @returns {Promise<object>} Contributor map */
  async contributorMap()   { return this.execute(MISSION_TYPES.CONTRIBUTOR_MAP); }

  /** @returns {Promise<object>} SDK surface */
  async sdkSurface()       { return this.execute(MISSION_TYPES.SDK_SURFACE); }

  // ---------------------------------------------------------------------------
  // Knowledge graph query (zero mission overhead)
  // ---------------------------------------------------------------------------

  /**
   * Query the knowledge graph by node type.
   * @param {string} nodeType
   * @returns {object[]}
   */
  query(nodeType) {
    this.#requireIndexed();
    return this.#graph.getByType(nodeType);
  }

  /**
   * Find nodes by predicate.
   * @param {(node: object) => boolean} predicate
   * @returns {object[]}
   */
  find(predicate) {
    this.#requireIndexed();
    return this.#graph.find(predicate);
  }

  /**
   * Export the full knowledge graph.
   * @returns {{ nodes: object[], edges: object[], stats: object }}
   */
  exportGraph() {
    this.#requireIndexed();
    return this.#graph.export();
  }

  /**
   * Return top-N hub nodes by phi-weighted score.
   * @param {number} [n=20]
   * @returns {object[]}
   */
  topHubs(n = 20) {
    this.#requireIndexed();
    return this.#graph.hubScores().slice(0, n);
  }

  // ---------------------------------------------------------------------------
  // Observability
  // ---------------------------------------------------------------------------

  /**
   * Engine identity and current state.
   * @returns {object}
   */
  status() {
    const graphStats = this.#rawIndex ? this.#graph.export().stats : null;
    return {
      engineId:     this.#engineId,
      repoRoot:     this.#indexer.root,
      indexed:      !!this.#rawIndex,
      context:      { ...this.#context },
      graphStats,
      queue:        this.#queue.status(),
      cache:        this.#cache.stats(),
      missionLog:   this.#router.list(),
      auditEntries: this.#auditLog.length,
    };
  }

  /**
   * Metrics snapshot.
   * @returns {object}
   */
  metrics() {
    return this.#metrics.export();
  }

  /**
   * Immutable audit log copy.
   * @returns {object[]}
   */
  getAuditLog() {
    return [...this.#auditLog];
  }

  /**
   * Engine config (read-only).
   * @returns {GitEngineConfig}
   */
  get config() {
    return this.#config;
  }

  /**
   * All available mission types.
   * @returns {object}
   */
  static get missionTypes() {
    return GitMissionRouter.types;
  }

  /** Clean up cache timers. Call when discarding the engine. */
  destroy() {
    this.#cache.destroy?.();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #requireIndexed() {
    if (!this.#rawIndex) {
      throw new Error(
        'Repository not indexed. Call engine.index() first, or use GitKnowledgeEngine.fromPath().',
      );
    }
  }

  /**
   * Compare current file list against stored fingerprints.
   * Returns files whose size or mtime changed.
   * @param {object[]} files
   * @returns {object[]}
   */
  #detectChanges(files) {
    const changed = [];
    for (const f of files) {
      const prev = this.#fingerprints.get(f.path);
      if (!prev || prev.size !== f.size) changed.push(f);
    }
    return changed;
  }

  /**
   * Update the fingerprint map from the current file list.
   * @param {object[]} files
   */
  #updateFingerprints(files) {
    this.#fingerprints.clear();
    for (const f of files) {
      this.#fingerprints.set(f.path, { size: f.size });
    }
  }

  /**
   * Append to audit log, capped at 500 entries.
   * @param {string} event
   * @param {string|null} missionId
   * @param {object} [meta]
   */
  #log(event, missionId, meta = {}) {
    if (this.#auditLog.length >= 500) this.#auditLog.shift();
    const entry = {
      engineId:  this.#engineId,
      event,
      missionId: missionId ?? null,
      tenantId:  this.#context.tenantId,
      userId:    this.#context.userId,
      meta,
      timestamp: new Date().toISOString(),
    };
    this.#auditLog.push(entry);
    this.emit('audit', entry);
  }
}

// ---------------------------------------------------------------------------
// NullCache — used when config.enableCache = false
// ---------------------------------------------------------------------------

class NullCache {
  static key() { return ''; }
  get()        { return undefined; }
  set()        {}
  invalidate() {}
  invalidatePrefix() {}
  clear()      {}
  stats()      { return { size: 0, hits: 0, misses: 0, evictions: 0, sets: 0, hitRate: 0 }; }
  destroy()    {}
}

export default GitKnowledgeEngine;
