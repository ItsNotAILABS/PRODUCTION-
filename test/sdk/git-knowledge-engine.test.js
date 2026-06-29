/**
 * Git Knowledge Engine — test suite
 * Uses node:test + node:assert/strict (same pattern as all other SDK tests).
 * ESM modules are imported via pathToFileURL + dynamic import().
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { pathToFileURL } = require('url');

const ENGINE_ROOT = path.resolve(__dirname, '../../sdk/git-knowledge-engine/src');
const REPO_ROOT   = path.resolve(__dirname, '../..');

const url = (file) => pathToFileURL(path.join(ENGINE_ROOT, file)).href;

// ── Lazily imported ESM modules ──────────────────────────────────────────────
let GitEngineConfig, GitCache, GitMetrics, GitMissionQueue, GitHealth;
let GitIndexer, GitKnowledgeGraph, GIT_NODE_TYPES;
let GitMissionRouter, MISSION_TYPES;
let GitExecutor;
let GitKnowledgeEngine;
let GitRepoRegistry;
let GitRestAdapter;

before(async () => {
  ({ GitEngineConfig }  = await import(url('git-config.js')));
  ({ GitCache }         = await import(url('git-cache.js')));
  ({ GitMetrics }       = await import(url('git-metrics.js')));
  ({ GitMissionQueue }  = await import(url('git-mission-queue.js')));
  ({ GitHealth }        = await import(url('git-health.js')));
  ({ GitIndexer }       = await import(url('git-indexer.js')));
  ({ GitKnowledgeGraph, GIT_NODE_TYPES } = await import(url('git-knowledge-graph.js')));
  ({ GitMissionRouter, MISSION_TYPES }   = await import(url('git-mission-router.js')));
  ({ GitExecutor }      = await import(url('git-executor.js')));
  ({ GitKnowledgeEngine } = await import(url('git-knowledge-engine.js')));
  ({ GitRepoRegistry }  = await import(url('git-repo-registry.js')));
  ({ GitRestAdapter }   = await import(url('git-rest-adapter.js')));
});

// ────────────────────────────────────────────────────────────────────────────
// GitEngineConfig
// ────────────────────────────────────────────────────────────────────────────
describe('GitEngineConfig', () => {
  it('should create with defaults', () => {
    const cfg = new GitEngineConfig();
    assert.equal(cfg.maxCommits, 200);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.enableCache, true);
    assert.equal(cfg.enableMetrics, true);
  });

  it('should accept overrides', () => {
    const cfg = new GitEngineConfig({ maxCommits: 50, logLevel: 'info' });
    assert.equal(cfg.maxCommits, 50);
    assert.equal(cfg.logLevel, 'info');
  });

  it('should be frozen after construction', () => {
    const cfg = new GitEngineConfig();
    assert.ok(Object.isFrozen(cfg));
  });

  it('should throw on invalid maxCommits', () => {
    assert.throws(() => new GitEngineConfig({ maxCommits: -1 }), RangeError);
    assert.throws(() => new GitEngineConfig({ maxCommits: 0  }), RangeError);
    assert.throws(() => new GitEngineConfig({ maxCommits: 1.5 }), RangeError);
  });

  it('should throw on invalid logLevel', () => {
    assert.throws(() => new GitEngineConfig({ logLevel: 'verbose' }), RangeError);
  });

  it('should serialise to JSON', () => {
    const cfg = new GitEngineConfig();
    const json = cfg.toJSON();
    assert.ok(typeof json === 'object');
    assert.ok('maxCommits' in json);
    assert.ok('logLevel' in json);
  });

  it('GitEngineConfig.from() should work with empty object', () => {
    const cfg = GitEngineConfig.from();
    assert.ok(cfg instanceof GitEngineConfig);
  });

  it('DEFAULTS should be frozen', () => {
    assert.ok(Object.isFrozen(GitEngineConfig.DEFAULTS));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitCache
// ────────────────────────────────────────────────────────────────────────────
describe('GitCache', () => {
  let cache;
  beforeEach(() => { cache = new GitCache(10_000); });

  it('should return undefined on miss', () => {
    assert.equal(cache.get('nope'), undefined);
  });

  it('should store and retrieve a value', () => {
    cache.set('k1', { data: 42 });
    assert.deepEqual(cache.get('k1'), { data: 42 });
  });

  it('should expire entries after TTL', async () => {
    const c = new GitCache(50); // 50ms TTL
    c.set('x', 'value');
    assert.equal(c.get('x'), 'value');
    await new Promise(r => setTimeout(r, 80));
    assert.equal(c.get('x'), undefined);
    c.destroy();
  });

  it('should report hit/miss stats', () => {
    cache.set('k', 1);
    cache.get('k');
    cache.get('missing');
    const s = cache.stats();
    assert.equal(s.hits,   1);
    assert.equal(s.misses, 1);
  });

  it('should invalidate a key', () => {
    cache.set('k', 1);
    cache.invalidate('k');
    assert.equal(cache.get('k'), undefined);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    assert.equal(cache.stats().size, 0);
  });

  it('GitCache.key() should be deterministic', () => {
    const k1 = GitCache.key('scan', { x: 1 });
    const k2 = GitCache.key('scan', { x: 1 });
    const k3 = GitCache.key('scan', { x: 2 });
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
  });

  it('should destroy without error', () => {
    assert.doesNotThrow(() => cache.destroy());
  });

  it('should throw on invalid TTL', () => {
    assert.throws(() => new GitCache(-1), RangeError);
    assert.throws(() => new GitCache(0),  RangeError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitMetrics
// ────────────────────────────────────────────────────────────────────────────
describe('GitMetrics', () => {
  let metrics;
  beforeEach(() => { metrics = new GitMetrics(); });

  it('should increment counters', () => {
    metrics.increment('ops');
    metrics.increment('ops');
    assert.equal(metrics.counter('ops'), 2);
  });

  it('should increment by custom delta', () => {
    metrics.increment('ops', 5);
    assert.equal(metrics.counter('ops'), 5);
  });

  it('should return 0 for unknown counter', () => {
    assert.equal(metrics.counter('nope'), 0);
  });

  it('should set and get gauges', () => {
    metrics.gauge('nodes', 100);
    assert.equal(metrics.getGauge('nodes'), 100);
  });

  it('should record timing samples', () => {
    metrics.recordTiming('op', 10);
    metrics.recordTiming('op', 20);
    const s = metrics.timingSummary('op');
    assert.equal(s.count, 2);
    assert.equal(s.minMs, 10);
    assert.equal(s.maxMs, 20);
  });

  it('should return null for unknown timing', () => {
    assert.equal(metrics.timingSummary('nope'), null);
  });

  it('should time an async function', async () => {
    const result = await metrics.time('task', async () => {
      await new Promise(r => setTimeout(r, 20));
      return 42;
    });
    assert.equal(result, 42);
    const s = metrics.timingSummary('task');
    assert.ok(s.count === 1);
    assert.ok(s.totalMs >= 10);
  });

  it('should export all metrics', () => {
    metrics.increment('x');
    metrics.gauge('y', 7);
    metrics.recordTiming('z', 5);
    const exp = metrics.export();
    assert.ok('counters' in exp);
    assert.ok('gauges' in exp);
    assert.ok('timings' in exp);
    assert.equal(exp.counters.x, 1);
    assert.equal(exp.gauges.y, 7);
  });

  it('should reset all metrics', () => {
    metrics.increment('x', 10);
    metrics.reset();
    assert.equal(metrics.counter('x'), 0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitMissionQueue
// ────────────────────────────────────────────────────────────────────────────
describe('GitMissionQueue', () => {
  it('should execute a job and return its result', async () => {
    const q = new GitMissionQueue({ maxConcurrent: 2, maxDepth: 10, timeoutMs: 5000 });
    const r = await q.enqueue(async () => 'done');
    assert.equal(r, 'done');
  });

  it('should run jobs in parallel up to maxConcurrent', async () => {
    const q = new GitMissionQueue({ maxConcurrent: 3, maxDepth: 10, timeoutMs: 5000 });
    const start = Date.now();
    await Promise.all([
      q.enqueue(async () => { await new Promise(r => setTimeout(r, 50)); }),
      q.enqueue(async () => { await new Promise(r => setTimeout(r, 50)); }),
      q.enqueue(async () => { await new Promise(r => setTimeout(r, 50)); }),
    ]);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 120, `Expected parallel run <120ms, got ${elapsed}ms`);
  });

  it('should reject when queue is full', async () => {
    const q = new GitMissionQueue({ maxConcurrent: 1, maxDepth: 1, timeoutMs: 5000 });
    // Fill the single running slot and the single pending slot
    const blocker = q.enqueue(() => new Promise(r => setTimeout(r, 200)));
    const pending = q.enqueue(() => Promise.resolve('ok')).catch(() => 'queued');
    // Third should be rejected immediately
    await assert.rejects(
      q.enqueue(() => Promise.resolve('overflow')),
      /queue depth/,
    );
    await blocker.catch(() => {});
    await pending;
  });

  it('should reject on timeout', async () => {
    const q = new GitMissionQueue({ maxConcurrent: 1, maxDepth: 10, timeoutMs: 50 });
    await assert.rejects(
      q.enqueue(() => new Promise(r => setTimeout(r, 500))),
      /timed out/,
    );
  });

  it('should propagate job errors', async () => {
    const q = new GitMissionQueue({ maxConcurrent: 2, maxDepth: 10, timeoutMs: 5000 });
    await assert.rejects(
      q.enqueue(async () => { throw new Error('job failed'); }),
      /job failed/,
    );
  });

  it('should report queue status', () => {
    const q = new GitMissionQueue();
    const s = q.status();
    assert.equal(s.running, 0);
    assert.equal(s.pending, 0);
    assert.ok('stats' in s);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitHealth
// ────────────────────────────────────────────────────────────────────────────
describe('GitHealth', () => {
  it('should probe with built-in clock check', async () => {
    const h = new GitHealth();
    const r = await h.probe();
    assert.equal(r.status, 'healthy');
    assert.ok(r.checks.clock.ok);
  });

  it('should report degraded when non-critical check fails', async () => {
    const h = new GitHealth();
    h.register('always-fail', () => ({ ok: false, detail: 'test' }), false);
    const r = await h.probe();
    assert.equal(r.status, 'degraded');
  });

  it('should report unhealthy when critical check fails', async () => {
    const h = new GitHealth();
    h.register('critical-fail', () => ({ ok: false }), true);
    const r = await h.probe();
    assert.equal(r.status, 'unhealthy');
  });

  it('should catch exceptions in checks', async () => {
    const h = new GitHealth();
    h.register('throws', () => { throw new Error('boom'); }, false);
    const r = await h.probe();
    assert.equal(r.checks.throws.ok, false);
    assert.ok(r.checks.throws.detail.includes('boom'));
  });

  it('liveness() should return alive=true', () => {
    const h = new GitHealth();
    const l = h.liveness();
    assert.equal(l.alive, true);
    assert.ok(typeof l.uptime === 'number');
  });

  it('fsReadCheck() should succeed for existing path', async () => {
    const check = GitHealth.fsReadCheck(REPO_ROOT);
    const r = check();
    assert.equal(r.ok, true);
  });

  it('fsReadCheck() should fail for non-existent path', async () => {
    const check = GitHealth.fsReadCheck('/no/such/path/xyz');
    const r = check();
    assert.equal(r.ok, false);
  });

  it('should throw on invalid check registration', () => {
    const h = new GitHealth();
    assert.throws(() => h.register('', () => {}),  TypeError);
    assert.throws(() => h.register('x', 'not-fn'), TypeError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitIndexer
// ────────────────────────────────────────────────────────────────────────────
describe('GitIndexer', () => {
  let indexer;
  before(() => {
    indexer = new GitIndexer(REPO_ROOT);
  });

  it('should expose root property', () => {
    assert.equal(indexer.root, REPO_ROOT);
  });

  it('should throw for non-existent path', () => {
    assert.throws(() => new GitIndexer('/no/such/repo/xyz'), Error);
  });

  it('should produce a full index with required fields', () => {
    const idx = indexer.index();
    assert.ok(idx.meta);
    assert.ok(Array.isArray(idx.files));
    assert.ok(Array.isArray(idx.commits));
    assert.ok(Array.isArray(idx.branches));
    assert.ok(Array.isArray(idx.keyFiles));
    assert.ok(idx.meta.totalFiles > 0);
  });

  it('should classify files into categories', () => {
    const idx = indexer.index();
    const cats = new Set(idx.files.map(f => f.category));
    assert.ok(cats.size > 1, 'Expected multiple categories');
  });

  it('should read recent commits', () => {
    const idx = indexer.index();
    assert.ok(idx.commits.length > 0);
    assert.ok(idx.commits[0].hash);
    assert.ok(idx.commits[0].author);
  });

  it('should identify at least one branch', () => {
    const idx = indexer.index();
    assert.ok(idx.branches.length > 0);
  });

  it('each file entry should have id, path, name, ext, size, category, depth', () => {
    const idx = indexer.index();
    const f = idx.files[0];
    assert.ok(f.id);
    assert.ok(typeof f.path === 'string');
    assert.ok(typeof f.name === 'string');
    assert.ok(typeof f.size === 'number');
    assert.ok(typeof f.depth === 'number');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitKnowledgeGraph
// ────────────────────────────────────────────────────────────────────────────
describe('GitKnowledgeGraph', () => {
  let graph;
  let indexer;

  before(() => {
    indexer = new GitIndexer(REPO_ROOT);
    const idx = indexer.index();
    graph = new GitKnowledgeGraph();
    graph.buildFromIndex(idx);
  });

  it('should have a repository root node', () => {
    const repo = graph.getRepository();
    assert.ok(repo);
    assert.equal(repo.node.type, 'repository');
  });

  it('should export nodes and edges', () => {
    const exp = graph.export();
    assert.ok(Array.isArray(exp.nodes));
    assert.ok(Array.isArray(exp.edges));
    assert.ok(exp.nodes.length > 0);
    assert.ok(exp.stats.totalNodes > 0);
  });

  it('should return protocol nodes', () => {
    const protos = graph.getProtocols();
    assert.ok(Array.isArray(protos));
    assert.ok(protos.length > 0, 'Expected protocol nodes from this repo');
  });

  it('should return governance nodes', () => {
    const gov = graph.getGovernance();
    assert.ok(Array.isArray(gov));
    assert.ok(gov.length > 0);
  });

  it('should return sdk-module nodes', () => {
    const mods = graph.getSdkModules();
    assert.ok(Array.isArray(mods));
    assert.ok(mods.length > 0);
  });

  it('getByType() should filter correctly', () => {
    const commits = graph.getByType('commit');
    assert.ok(commits.every(n => n.type === 'commit'));
  });

  it('find() should support arbitrary predicates', () => {
    const large = graph.find(n => (n.properties?.size ?? 0) > 50_000);
    assert.ok(Array.isArray(large));
  });

  it('hubScores() should return sorted array', () => {
    const scores = graph.hubScores();
    assert.ok(scores.length > 0);
    assert.ok(scores[0].score >= scores[scores.length - 1].score);
  });

  it('GIT_NODE_TYPES should include expected types', () => {
    assert.ok(GIT_NODE_TYPES.has('repository'));
    assert.ok(GIT_NODE_TYPES.has('file'));
    assert.ok(GIT_NODE_TYPES.has('protocol'));
    assert.ok(GIT_NODE_TYPES.has('governance'));
    assert.ok(GIT_NODE_TYPES.has('commit'));
    assert.ok(GIT_NODE_TYPES.has('author'));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitMissionRouter
// ────────────────────────────────────────────────────────────────────────────
describe('GitMissionRouter', () => {
  let router;
  beforeEach(() => { router = new GitMissionRouter(); });

  it('should create a mission with required fields', () => {
    const m = router.create(MISSION_TYPES.SCAN);
    assert.ok(m.id);
    assert.equal(m.type, MISSION_TYPES.SCAN);
    assert.equal(m.status, 'pending');
    assert.ok(m.createdAt);
    assert.equal(m.risk, 'low');
  });

  it('should accept tenantId and userId', () => {
    const m = router.create(MISSION_TYPES.DIGEST, { tenantId: 'acme', userId: 'alice' });
    assert.equal(m.tenantId, 'acme');
    assert.equal(m.userId, 'alice');
  });

  it('should throw for unknown mission type', () => {
    assert.throws(() => router.create('nonexistent'), Error);
  });

  it('should transition to running', () => {
    const m = router.create(MISSION_TYPES.SCAN);
    router.start(m.id);
    const updated = router.get(m.id);
    assert.equal(updated.status, 'running');
    assert.ok(updated.startedAt);
  });

  it('should transition to completed with result', () => {
    const m = router.create(MISSION_TYPES.SCAN);
    router.start(m.id);
    router.complete(m.id, { count: 10 });
    const done = router.get(m.id);
    assert.equal(done.status, 'completed');
    assert.deepEqual(done.result, { count: 10 });
  });

  it('should transition to failed with error', () => {
    const m = router.create(MISSION_TYPES.SCAN);
    router.start(m.id);
    router.fail(m.id, 'something went wrong');
    const failed = router.get(m.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'something went wrong');
  });

  it('should list missions filtered by status', () => {
    router.create(MISSION_TYPES.SCAN);
    const pending = router.list({ status: 'pending' });
    assert.ok(pending.length >= 1);
    assert.ok(pending.every(m => m.status === 'pending'));
  });

  it('MISSION_TYPES should include all 10 types', () => {
    const types = Object.values(MISSION_TYPES);
    assert.ok(types.length >= 10);
    assert.ok(types.includes('scan'));
    assert.ok(types.includes('digest'));
    assert.ok(types.includes('trace'));
  });

  it('GitMissionRouter.types should return static copy', () => {
    const t = GitMissionRouter.types;
    assert.ok(t.SCAN);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitKnowledgeEngine — integration
// ────────────────────────────────────────────────────────────────────────────
describe('GitKnowledgeEngine', () => {
  let engine;

  before(async () => {
    engine = await GitKnowledgeEngine.fromPath(REPO_ROOT, {
      config: { cacheTtlMs: 60_000, maxConcurrentMissions: 4 },
    });
  });

  it('should report indexed=true after fromPath()', () => {
    assert.equal(engine.status().indexed, true);
  });

  it('should have an engineId', () => {
    assert.ok(engine.status().engineId);
  });

  it('config should be a GitEngineConfig instance', () => {
    assert.ok(engine.config instanceof GitEngineConfig);
  });

  it('should execute a scan mission', async () => {
    const r = await engine.scan();
    assert.ok(r.missionId);
    assert.equal(r.type, 'scan');
    assert.ok(r.result.graph);
  });

  it('should execute a digest mission', async () => {
    const r = await engine.digest();
    assert.ok(r.result.repository.name);
    assert.ok(r.result.repository.totalFiles > 0);
  });

  it('should execute auditProtocols and return count > 0', async () => {
    const r = await engine.auditProtocols();
    assert.ok(r.result.count > 0);
  });

  it('should execute auditGovernance', async () => {
    const r = await engine.auditGovernance();
    assert.ok(typeof r.result.count === 'number');
  });

  it('should execute entrySurface', async () => {
    const r = await engine.entrySurface();
    assert.ok(typeof r.result.count === 'number');
    assert.ok(Array.isArray(r.result.entries));
  });

  it('should execute trace and return topHubs', async () => {
    const r = await engine.trace();
    assert.ok(Array.isArray(r.result.topHubs));
    assert.ok(r.result.topHubs.length > 0);
  });

  it('should execute contributorMap', async () => {
    const r = await engine.contributorMap();
    assert.ok(r.result.totalCommits > 0);
    assert.ok(r.result.contributors.length > 0);
  });

  it('should execute sdkSurface', async () => {
    const r = await engine.sdkSurface();
    assert.ok(r.result.count > 0);
  });

  it('should cache results on second call', async () => {
    const r1 = await engine.execute('digest');
    const r2 = await engine.execute('digest');
    assert.equal(r1.missionId, r2.missionId); // same cached object
  });

  it('bypassCache=true should re-execute', async () => {
    const r1 = await engine.execute('digest');
    const r2 = await engine.execute('digest', { bypassCache: true });
    assert.notEqual(r1.missionId, r2.missionId);
  });

  it('should return metrics snapshot', () => {
    const m = engine.metrics();
    assert.ok('counters' in m);
    assert.ok('timings' in m);
    assert.ok('gauges' in m);
  });

  it('should return audit log', () => {
    const log = engine.getAuditLog();
    assert.ok(Array.isArray(log));
    assert.ok(log.length > 0);
  });

  it('should emit "mission:complete" event', async () => {
    let received = null;
    engine.once('mission:complete', (e) => { received = e; });
    await engine.execute('contributor-map', { bypassCache: true });
    assert.ok(received);
    assert.equal(received.type, 'contributor-map');
    assert.ok(typeof received.durationMs === 'number');
  });

  it('query() should return nodes by type', () => {
    const protocols = engine.query('protocol');
    assert.ok(protocols.length > 0);
    assert.ok(protocols.every(n => n.type === 'protocol'));
  });

  it('find() should support predicates', () => {
    const results = engine.find(n => n.type === 'author');
    assert.ok(Array.isArray(results));
  });

  it('exportGraph() should return nodes and edges', () => {
    const g = engine.exportGraph();
    assert.ok(g.nodes.length > 0);
    assert.ok(g.edges.length > 0);
    assert.ok(g.stats.totalNodes > 0);
  });

  it('topHubs() should return sorted hub scores', () => {
    const hubs = engine.topHubs(10);
    assert.equal(hubs.length, 10);
    assert.ok(hubs[0].score >= hubs[9].score);
  });

  it('should re-index without error', async () => {
    const result = await engine.index();
    assert.ok(result.meta);
    assert.ok(result.stats);
  });

  it('should throw without index', async () => {
    const indexer = new GitIndexer(REPO_ROOT);
    const e2 = new GitKnowledgeEngine(indexer);
    assert.throws(() => e2.query('file'), /not indexed/);
  });

  it('missionTypes should be available statically', () => {
    const types = GitKnowledgeEngine.missionTypes;
    assert.ok(types.SCAN);
    assert.ok(types.DIGEST);
  });

  it('destroy() should not throw', () => {
    const indexer2 = new GitIndexer(REPO_ROOT);
    const e2 = new GitKnowledgeEngine(indexer2);
    assert.doesNotThrow(() => e2.destroy());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitRepoRegistry
// ────────────────────────────────────────────────────────────────────────────
describe('GitRepoRegistry', () => {
  it('should register a repo and index it', async () => {
    const registry = new GitRepoRegistry();
    const r = await registry.register(REPO_ROOT, { repoId: 'prod', meta: { env: 'test' } });
    assert.equal(r.repoId, 'prod');
    assert.ok(r.stats);
  });

  it('should list registered repos', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'r1' });
    const list = registry.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].repoId, 'r1');
  });

  it('should throw when registering duplicate repoId', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'dup' });
    await assert.rejects(
      registry.register(REPO_ROOT, { repoId: 'dup' }),
      /already registered/,
    );
  });

  it('should unregister a repo', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'tmp' });
    registry.unregister('tmp');
    assert.equal(registry.list().length, 0);
  });

  it('should execute a mission on a specific repo', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'exec-test' });
    const r = await registry.execute('exec-test', 'digest');
    assert.ok(r.result.repository.name);
  });

  it('executeAll() should run across all repos', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'all-1' });
    const results = await registry.executeAll('contributor-map');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
  });

  it('healthCheck() should report healthy repos', async () => {
    const registry = new GitRepoRegistry();
    await registry.register(REPO_ROOT, { repoId: 'health-test' });
    const h = await registry.healthCheck();
    assert.equal(h.healthy, 1);
    assert.equal(h.total, 1);
  });

  it('should throw when accessing unknown repo', () => {
    const registry = new GitRepoRegistry();
    assert.throws(() => registry.getEngine('ghost'), /not registered/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitRestAdapter
// ────────────────────────────────────────────────────────────────────────────
describe('GitRestAdapter', () => {
  let engine;
  let adapter;

  before(async () => {
    engine  = await GitKnowledgeEngine.fromPath(REPO_ROOT);
    adapter = new GitRestAdapter({ engine });
  });

  function mockRes() {
    const res = { _status: 200, _body: null };
    res.status = (n) => { res._status = n; return res; };
    res.json   = (b) => { res._body = b; return res; };
    return res;
  }

  it('should throw if neither engine nor registry provided', () => {
    assert.throws(() => new GitRestAdapter(), Error);
  });

  it('GET /health should return healthy status', async () => {
    const req = { method: 'GET', url: '/health', path: '/health' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
  });

  it('GET /status should return engine status', async () => {
    const req = { method: 'GET', url: '/status', path: '/status' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
    assert.ok(res._body.engineId);
  });

  it('GET /graph should return knowledge graph', async () => {
    const req = { method: 'GET', url: '/graph', path: '/graph' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
    assert.ok(Array.isArray(res._body.nodes));
  });

  it('GET /hubs should return hub scores', async () => {
    const req = { method: 'GET', url: '/hubs?n=5', path: '/hubs' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
    assert.ok(Array.isArray(res._body.hubs));
  });

  it('POST /missions should execute a mission', async () => {
    const req = {
      method: 'POST',
      url:    '/missions',
      path:   '/missions',
      body:   { type: 'contributor-map' },
    };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
    assert.ok(res._body.result);
  });

  it('POST /missions without type should 400', async () => {
    const req = { method: 'POST', url: '/missions', path: '/missions', body: {} };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 400);
  });

  it('GET /missions should list available types', async () => {
    const req = { method: 'GET', url: '/missions', path: '/missions' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 200);
    assert.ok(Array.isArray(res._body.types));
  });

  it('unknown route should 404', async () => {
    const req = { method: 'GET', url: '/nowhere', path: '/nowhere' };
    const res = mockRes();
    await adapter.handle(req, res);
    assert.equal(res._status, 404);
  });

  it('middleware() should return a function', () => {
    assert.equal(typeof adapter.middleware(), 'function');
  });
});
