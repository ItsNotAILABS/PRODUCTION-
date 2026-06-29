import { MISSION_TYPES } from './git-mission-router.js';

/**
 * GitRestAdapter — framework-agnostic HTTP handler for the Git Knowledge Engine.
 *
 * Mount on any Node.js HTTP server or Express/Fastify/Hono router.
 * The adapter duck-types req/res — it only uses:
 *   req.method, req.url (or req.path), req.body (parsed JSON)
 *   res.json(obj), res.status(n), res.end() / res.send()
 *
 * Route table:
 *   GET  /health          → engine + queue health probe
 *   GET  /status          → engine status + metrics
 *   GET  /graph           → full knowledge graph export
 *   GET  /hubs            → top-N hub nodes (?n=20)
 *   GET  /repos           → registered repos (registry mode)
 *   POST /index           → trigger (re-)indexing
 *   POST /missions        → execute a named mission  { type, params }
 *   POST /repos           → register a new repo { path, repoId?, meta? }
 *   DELETE /repos/:id     → unregister a repo
 */
export class GitRestAdapter {
  /** @type {import('./git-knowledge-engine.js').GitKnowledgeEngine | null} */
  #engine;

  /** @type {import('./git-repo-registry.js').GitRepoRegistry | null} */
  #registry;

  /** @type {import('./git-health.js').GitHealth | null} */
  #health;

  /**
   * @param {{
   *   engine?:   import('./git-knowledge-engine.js').GitKnowledgeEngine,
   *   registry?: import('./git-repo-registry.js').GitRepoRegistry,
   *   health?:   import('./git-health.js').GitHealth,
   * }} sources
   */
  constructor({ engine = null, registry = null, health = null } = {}) {
    if (!engine && !registry) {
      throw new Error('GitRestAdapter requires at least one of: engine, registry');
    }
    this.#engine   = engine;
    this.#registry = registry;
    this.#health   = health;
  }

  /**
   * Returns an Express-compatible middleware function.
   * Mount as: app.use('/git', adapter.middleware())
   * @returns {Function}
   */
  middleware() {
    return (req, res, next) => {
      this.handle(req, res).catch(next);
    };
  }

  /**
   * Handle a single HTTP request. Call directly when not using middleware.
   * @param {object} req
   * @param {object} res
   */
  async handle(req, res) {
    const method = (req.method ?? 'GET').toUpperCase();
    const rawPath = req.path ?? req.url?.split('?')[0] ?? '/';
    const path = rawPath.replace(/\/$/, '') || '/';
    const query = this.#parseQuery(req.url ?? '');

    try {
      // ── Health ───────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/health') {
        if (this.#health) {
          return this.#ok(res, await this.#health.probe());
        }
        return this.#ok(res, { status: 'healthy', message: 'No health checks registered' });
      }

      // ── Status ───────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/status') {
        if (this.#engine) return this.#ok(res, this.#engine.status());
        if (this.#registry) return this.#ok(res, await this.#registry.healthCheck());
        return this.#notFound(res);
      }

      // ── Graph export ─────────────────────────────────────────────────────
      if (method === 'GET' && path === '/graph') {
        const engine = this.#engine ?? this.#registryEngine(req, query);
        if (!engine) return this.#badRequest(res, 'No engine available. Pass repoId query param when using registry.');
        return this.#ok(res, engine.exportGraph());
      }

      // ── Hub scores ───────────────────────────────────────────────────────
      if (method === 'GET' && path === '/hubs') {
        const engine = this.#engine ?? this.#registryEngine(req, query);
        if (!engine) return this.#badRequest(res, 'No engine available.');
        const n = Math.min(parseInt(query.n ?? '20', 10) || 20, 200);
        return this.#ok(res, { hubs: engine.topHubs(n) });
      }

      // ── Repos (registry) ─────────────────────────────────────────────────
      if (this.#registry) {
        if (method === 'GET' && path === '/repos') {
          return this.#ok(res, this.#registry.list());
        }
        if (method === 'POST' && path === '/repos') {
          const body = await this.#parseBody(req);
          if (!body.path) return this.#badRequest(res, 'Missing required field: path');
          const result = await this.#registry.register(body.path, {
            repoId: body.repoId,
            meta:   body.meta ?? {},
          });
          return this.#created(res, result);
        }
        if (method === 'DELETE' && path.startsWith('/repos/')) {
          const repoId = decodeURIComponent(path.slice('/repos/'.length));
          this.#registry.unregister(repoId);
          return this.#ok(res, { unregistered: repoId });
        }
      }

      // ── Index ─────────────────────────────────────────────────────────────
      if (method === 'POST' && path === '/index') {
        const engine = this.#engine ?? this.#registryEngine(req, query);
        if (!engine) return this.#badRequest(res, 'No engine available.');
        const result = await engine.index();
        return this.#ok(res, result);
      }

      // ── Missions ──────────────────────────────────────────────────────────
      if (method === 'POST' && path === '/missions') {
        const body = await this.#parseBody(req);
        if (!body.type) {
          return this.#badRequest(res, `Missing required field: type. Valid types: ${Object.values(MISSION_TYPES).join(', ')}`);
        }

        // Registry-wide mission execution
        if (this.#registry && body.all) {
          const results = await this.#registry.executeAll(body.type, { params: body.params ?? {} });
          return this.#ok(res, results);
        }

        const engine = this.#engine ?? this.#registryEngine(req, query);
        if (!engine) return this.#badRequest(res, 'No engine. Use ?repoId= or register a single engine.');
        const result = await engine.execute(body.type, { params: body.params ?? {} });
        return this.#ok(res, result);
      }

      // ── Mission types listing ─────────────────────────────────────────────
      if (method === 'GET' && path === '/missions') {
        return this.#ok(res, { types: Object.values(MISSION_TYPES) });
      }

      return this.#notFound(res);

    } catch (err) {
      return this.#error(res, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  #registryEngine(req, query) {
    if (!this.#registry) return null;
    const repoId = query.repoId ?? req.params?.repoId;
    if (!repoId) return null;
    try { return this.#registry.getEngine(repoId); } catch { return null; }
  }

  #parseQuery(url) {
    const idx = url.indexOf('?');
    if (idx === -1) return {};
    try {
      return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
    } catch { return {}; }
  }

  async #parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    return new Promise((resolve) => {
      let raw = '';
      req.on?.('data', (chunk) => { raw += chunk; });
      req.on?.('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
      req.on?.('error', () => resolve({}));
      // If no events fire (already buffered), resolve immediately
      if (!req.on) resolve({});
    });
  }

  #ok(res, body)      { return this.#send(res, 200, body); }
  #created(res, body) { return this.#send(res, 201, body); }
  #badRequest(res, msg) { return this.#send(res, 400, { error: msg }); }
  #notFound(res)      { return this.#send(res, 404, { error: 'Not found' }); }
  #error(res, err)    { return this.#send(res, 500, { error: err.message ?? 'Internal error' }); }

  #send(res, status, body) {
    if (typeof res.status === 'function') {
      res.status(status).json(body);
    } else if (typeof res.writeHead === 'function') {
      const payload = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    }
  }
}

export default GitRestAdapter;
