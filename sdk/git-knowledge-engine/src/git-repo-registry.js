import { GitKnowledgeEngine } from './git-knowledge-engine.js';
import { GitEngineConfig } from './git-config.js';

/**
 * GitRepoRegistry — manages a fleet of GitKnowledgeEngine instances,
 * one per registered repository. Provides a single entrypoint for
 * multi-repo operations: register, execute, query, and health-check
 * across all repos in a single tenant context.
 *
 * This is the primary business-tier API when running the Git Knowledge
 * Engine as a shared service over multiple repositories.
 */
export class GitRepoRegistry {
  /** @type {Map<string, { engine: GitKnowledgeEngine, repoId: string, registeredAt: string, meta: object }>} */
  #repos = new Map();

  /** @type {GitEngineConfig} */
  #config;

  /** @type {{ tenantId: string, userId: string }} */
  #context;

  /**
   * @param {{ config?: GitEngineConfig|object, tenantId?: string, userId?: string }} [opts]
   */
  constructor({ config, tenantId = 'default', userId = 'system' } = {}) {
    this.#config  = config instanceof GitEngineConfig
      ? config
      : GitEngineConfig.from(config ?? {});
    this.#context = { tenantId, userId };
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a repository by its local path. Automatically indexes it.
   * Returns the repoId for subsequent operations.
   * @param {string} repoPath - Local absolute path to the repository root.
   * @param {{ repoId?: string, meta?: object }} [opts]
   * @returns {Promise<{ repoId: string, meta: object, stats: object }>}
   */
  async register(repoPath, { repoId, meta = {} } = {}) {
    const id = repoId ?? this.#idFromPath(repoPath);

    if (this.#repos.has(id)) {
      throw new Error(`GitRepoRegistry: repo "${id}" is already registered. Use reindex() to refresh.`);
    }

    const engine = await GitKnowledgeEngine.fromPath(repoPath, {
      ...this.#context,
      config: this.#config,
    });

    const status = engine.status();

    this.#repos.set(id, {
      engine,
      repoId: id,
      repoPath,
      registeredAt: new Date().toISOString(),
      meta,
    });

    return { repoId: id, meta, stats: status.graphStats };
  }

  /**
   * Re-index an already-registered repository.
   * @param {string} repoId
   * @returns {Promise<{ repoId: string, stats: object }>}
   */
  async reindex(repoId) {
    const entry = this.#require(repoId);
    const { meta } = await entry.engine.index();
    return { repoId, stats: entry.engine.status().graphStats, meta };
  }

  /**
   * Unregister a repository and clean up its resources.
   * @param {string} repoId
   */
  unregister(repoId) {
    this.#require(repoId);
    this.#repos.delete(repoId);
  }

  /**
   * List all registered repositories.
   * @returns {Array<{ repoId: string, repoPath: string, registeredAt: string, meta: object, status: object }>}
   */
  list() {
    return [...this.#repos.values()].map(({ engine, repoId, repoPath, registeredAt, meta }) => ({
      repoId,
      repoPath,
      registeredAt,
      meta,
      status: engine.status(),
    }));
  }

  /**
   * Get a single engine by repoId for direct access.
   * @param {string} repoId
   * @returns {GitKnowledgeEngine}
   */
  getEngine(repoId) {
    return this.#require(repoId).engine;
  }

  // ---------------------------------------------------------------------------
  // Cross-repo operations
  // ---------------------------------------------------------------------------

  /**
   * Execute a mission on a single repo.
   * @param {string} repoId
   * @param {string} missionType
   * @param {object} [opts]
   * @returns {Promise<object>}
   */
  async execute(repoId, missionType, opts = {}) {
    return this.#require(repoId).engine.execute(missionType, opts);
  }

  /**
   * Execute the same mission across ALL registered repos in parallel.
   * @param {string} missionType
   * @param {object} [opts]
   * @returns {Promise<Array<{ repoId: string, success: boolean, result?: object, error?: string }>>}
   */
  async executeAll(missionType, opts = {}) {
    const entries = [...this.#repos.entries()];
    const settled = await Promise.allSettled(
      entries.map(([id, { engine }]) => engine.execute(missionType, opts)),
    );
    return settled.map((r, i) => ({
      repoId:  entries[i][0],
      success: r.status === 'fulfilled',
      result:  r.status === 'fulfilled' ? r.value : undefined,
      error:   r.status === 'rejected'  ? r.reason?.message : undefined,
    }));
  }

  /**
   * Produce a fleet-wide digest — one digest per repo, combined into a summary.
   * @returns {Promise<{ repoCount: number, repos: object[], generatedAt: string }>}
   */
  async fleetDigest() {
    const results = await this.executeAll('digest');
    return {
      repoCount:   this.#repos.size,
      repos:       results,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Health probe across all registered repos.
   * @returns {Promise<{ healthy: number, degraded: number, total: number, repos: object[] }>}
   */
  async healthCheck() {
    const statuses = [...this.#repos.entries()].map(([id, { engine }]) => {
      const s = engine.status();
      return {
        repoId:   id,
        indexed:  s.indexed,
        missions: s.missionLog?.length ?? 0,
        healthy:  s.indexed,
      };
    });

    return {
      healthy:  statuses.filter((s) => s.healthy).length,
      degraded: statuses.filter((s) => !s.healthy).length,
      total:    statuses.length,
      repos:    statuses,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #require(repoId) {
    const entry = this.#repos.get(repoId);
    if (!entry) throw new Error(`GitRepoRegistry: repo "${repoId}" not registered.`);
    return entry;
  }

  #idFromPath(repoPath) {
    return repoPath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .join('/')
      .replace(/[^a-zA-Z0-9-_/]/g, '_');
  }
}

export default GitRepoRegistry;
