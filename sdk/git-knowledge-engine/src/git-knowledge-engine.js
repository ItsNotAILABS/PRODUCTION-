import crypto from 'node:crypto';
import { GitIndexer } from './git-indexer.js';
import { GitKnowledgeGraph } from './git-knowledge-graph.js';
import { GitMissionRouter, MISSION_TYPES } from './git-mission-router.js';
import { GitExecutor } from './git-executor.js';

/**
 * GitKnowledgeEngine — the X ecosystem entry point for any Git repository.
 *
 * Workflow:
 *   const engine = await GitKnowledgeEngine.fromPath('/path/to/repo');
 *   const result = await engine.execute('digest');
 *
 * The engine indexes the repository into a sovereign knowledge graph,
 * then routes missions through the X protocol layer for execution.
 * All missions are logged, tenanted, and governance-tagged.
 */
export class GitKnowledgeEngine {
  /** @type {GitIndexer} */
  #indexer;

  /** @type {GitKnowledgeGraph} */
  #graph;

  /** @type {GitMissionRouter} */
  #router;

  /** @type {GitExecutor} */
  #executor;

  /** @type {object | null} */
  #rawIndex = null;

  /** @type {string} */
  #engineId;

  /** @type {{ tenantId: string, userId: string }} */
  #context;

  /** @type {object[]} Append-only execution log */
  #auditLog = [];

  /**
   * @param {GitIndexer} indexer
   * @param {{ tenantId?: string, userId?: string }} [context]
   */
  constructor(indexer, context = {}) {
    this.#indexer   = indexer;
    this.#graph     = new GitKnowledgeGraph();
    this.#router    = new GitMissionRouter();
    this.#engineId  = crypto.randomUUID();
    this.#context   = {
      tenantId: context.tenantId ?? 'default',
      userId:   context.userId   ?? 'system',
    };
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  /**
   * Create and initialise a GitKnowledgeEngine from a local repo path.
   * Automatically indexes the repo on creation.
   * @param {string} repoPath - Absolute or relative path to the repo root.
   * @param {{ tenantId?: string, userId?: string }} [context]
   * @returns {Promise<GitKnowledgeEngine>}
   */
  static async fromPath(repoPath, context = {}) {
    const indexer = new GitIndexer(repoPath);
    const engine  = new GitKnowledgeEngine(indexer, context);
    await engine.index();
    return engine;
  }

  // ---------------------------------------------------------------------------
  // Indexing
  // ---------------------------------------------------------------------------

  /**
   * Build (or rebuild) the knowledge graph from the repository.
   * Safe to call multiple times — reinitialises the graph each time.
   * @returns {Promise<{ meta: object, stats: object }>}
   */
  async index() {
    this.#rawIndex = this.#indexer.index();
    this.#graph    = new GitKnowledgeGraph();
    this.#graph.buildFromIndex(this.#rawIndex);

    const graphExport = this.#graph.export();

    this.#log('index', null, {
      totalFiles:  this.#rawIndex.meta.totalFiles,
      graphNodes:  graphExport.stats.totalNodes,
      graphEdges:  graphExport.stats.totalEdges,
    });

    return {
      meta:  this.#rawIndex.meta,
      stats: graphExport.stats,
    };
  }

  // ---------------------------------------------------------------------------
  // Mission execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a named mission against the knowledge graph.
   * @param {string} missionType - One of MISSION_TYPES.*  (or the string value)
   * @param {{ params?: object, tags?: string[] }} [opts]
   * @returns {Promise<object>} { missionId, type, result, duration, completedAt }
   */
  async execute(missionType, opts = {}) {
    this.#requireIndexed();

    if (!this.#executor) {
      this.#executor = new GitExecutor(this.#graph, this.#rawIndex);
    }

    const mission = this.#router.create(missionType, {
      tenantId: this.#context.tenantId,
      userId:   this.#context.userId,
      ...opts,
    });

    this.#router.start(mission.id);
    const t0 = Date.now();

    let result;
    try {
      result = await this.#executor.execute(mission);
      this.#router.complete(mission.id, result);
    } catch (err) {
      this.#router.fail(mission.id, err.message);
      this.#log('mission-failed', mission.id, { type: missionType, error: err.message });
      throw err;
    }

    const duration = Date.now() - t0;
    this.#log('mission-complete', mission.id, { type: missionType, duration });

    return {
      missionId:   mission.id,
      type:        missionType,
      tenantId:    this.#context.tenantId,
      result,
      durationMs:  duration,
      completedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Convenience mission shortcuts
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

  /** @returns {Promise<object>} Entry surface detection */
  async entrySurface()     { return this.execute(MISSION_TYPES.ENTRY_SURFACE); }

  /** @returns {Promise<object>} Schema extraction */
  async extractSchemas()   { return this.execute(MISSION_TYPES.EXTRACT_SCHEMAS); }

  /** @returns {Promise<object>} Mission detection */
  async detectMissions()   { return this.execute(MISSION_TYPES.DETECT_MISSIONS); }

  /** @returns {Promise<object>} Contributor map */
  async contributorMap()   { return this.execute(MISSION_TYPES.CONTRIBUTOR_MAP); }

  /** @returns {Promise<object>} SDK surface listing */
  async sdkSurface()       { return this.execute(MISSION_TYPES.SDK_SURFACE); }

  // ---------------------------------------------------------------------------
  // Knowledge graph query (direct, no mission overhead)
  // ---------------------------------------------------------------------------

  /**
   * Query the knowledge graph directly.
   * @param {string} nodeType - e.g. 'protocol', 'file', 'commit', 'author'
   * @returns {object[]}
   */
  query(nodeType) {
    this.#requireIndexed();
    return this.#graph.getByType(nodeType);
  }

  /**
   * Find nodes matching an arbitrary predicate.
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
  // Audit log
  // ---------------------------------------------------------------------------

  /**
   * Return the immutable audit log for this engine session.
   * @returns {object[]}
   */
  getAuditLog() {
    return [...this.#auditLog];
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  /**
   * Engine identity and status.
   * @returns {object}
   */
  status() {
    const graphStats = this.#rawIndex
      ? this.#graph.export().stats
      : null;

    return {
      engineId:   this.#engineId,
      repoRoot:   this.#indexer.root,
      indexed:    !!this.#rawIndex,
      context:    { ...this.#context },
      graphStats,
      missionLog: this.#router.list(),
      auditEntries: this.#auditLog.length,
    };
  }

  /**
   * List all available mission types.
   * @returns {object}
   */
  static get missionTypes() {
    return GitMissionRouter.types;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #requireIndexed() {
    if (!this.#rawIndex) {
      throw new Error('Repository not indexed. Call engine.index() first, or use GitKnowledgeEngine.fromPath().');
    }
  }

  /**
   * Append an entry to the immutable audit log.
   * @param {string} event
   * @param {string | null} missionId
   * @param {object} [meta]
   */
  #log(event, missionId, meta = {}) {
    this.#auditLog.push({
      engineId:  this.#engineId,
      event,
      missionId: missionId ?? null,
      tenantId:  this.#context.tenantId,
      userId:    this.#context.userId,
      meta,
      timestamp: new Date().toISOString(),
    });
  }
}

export default GitKnowledgeEngine;
