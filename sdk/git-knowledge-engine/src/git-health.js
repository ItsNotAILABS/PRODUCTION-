import fs from 'node:fs';

/**
 * GitHealth — liveness and readiness probes for the Git Knowledge Engine.
 * Suitable for exposing via a /health or /readiness HTTP endpoint,
 * a Kubernetes probe, or an internal monitoring loop.
 */
export class GitHealth {
  /** @type {Map<string, { check: Function, critical: boolean }>} */
  #checks = new Map();

  constructor() {
    // Built-in checks — additional checks added via register()
    this.#register('clock', () => ({ ok: true, ts: new Date().toISOString() }), false);
  }

  /**
   * Register a named health check.
   * @param {string} name
   * @param {() => Promise<{ ok: boolean, detail?: string }>|{ ok: boolean, detail?: string }} check
   * @param {boolean} [critical=false] - If true, a failure marks the whole probe unhealthy.
   */
  register(name, check, critical = false) {
    if (typeof name !== 'string' || !name) throw new TypeError('name must be a non-empty string');
    if (typeof check !== 'function') throw new TypeError('check must be a function');
    this.#checks.set(name, { check, critical });
    return this;
  }

  /**
   * Run all registered health checks and return a structured report.
   * @returns {Promise<{ status: 'healthy'|'degraded'|'unhealthy', checks: object, evaluatedAt: string }>}
   */
  async probe() {
    const results = {};
    let criticalFailed = false;
    let anyFailed = false;

    for (const [name, { check, critical }] of this.#checks) {
      const t0 = Date.now();
      try {
        const r = await check();
        const ok = r?.ok ?? false;
        results[name] = { ok, durationMs: Date.now() - t0, detail: r?.detail ?? null };
        if (!ok) {
          anyFailed = true;
          if (critical) criticalFailed = true;
        }
      } catch (err) {
        results[name] = { ok: false, durationMs: Date.now() - t0, detail: err.message };
        anyFailed = true;
        if (critical) criticalFailed = true;
      }
    }

    const status = criticalFailed ? 'unhealthy' : anyFailed ? 'degraded' : 'healthy';

    return { status, checks: results, evaluatedAt: new Date().toISOString() };
  }

  /**
   * Quick liveness check — just returns true if the process is running.
   * @returns {{ alive: boolean, uptime: number }}
   */
  liveness() {
    return { alive: true, uptime: process.uptime() };
  }

  // ---------------------------------------------------------------------------
  // Built-in check factories
  // ---------------------------------------------------------------------------

  /**
   * Create a filesystem readability check for a given path.
   * @param {string} dirPath
   * @returns {Function}
   */
  static fsReadCheck(dirPath) {
    return () => {
      const ok = fs.existsSync(dirPath);
      return { ok, detail: ok ? null : `Path not found: ${dirPath}` };
    };
  }

  /**
   * Create a check that verifies a GitKnowledgeEngine has been indexed.
   * @param {{ status: () => object }} engine
   * @returns {Function}
   */
  static engineIndexedCheck(engine) {
    return () => {
      const s = engine.status();
      return {
        ok:     s.indexed,
        detail: s.indexed ? null : 'Engine not yet indexed',
      };
    };
  }

  /**
   * Create a check that verifies mission queue is not full.
   * @param {{ status: () => { pending: number } }} queue
   * @param {number} warnThreshold - Warn if pending exceeds this fraction of maxDepth.
   * @param {number} maxDepth
   * @returns {Function}
   */
  static queuePressureCheck(queue, warnThreshold = 0.8, maxDepth = 64) {
    return () => {
      const { pending } = queue.status();
      const pct = pending / maxDepth;
      return {
        ok:     pct < warnThreshold,
        detail: pct >= warnThreshold ? `Queue ${(pct * 100).toFixed(0)}% full (${pending}/${maxDepth})` : null,
      };
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  #register(name, check, critical) {
    this.#checks.set(name, { check, critical });
  }
}

export default GitHealth;
