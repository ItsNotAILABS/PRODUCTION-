'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const ECOSYSTEM_SRC = path.resolve(__dirname, '../../sdk/x-ecosystem/src/index.js');
const CONNECTORS_SRC = path.resolve(__dirname, '../../sdk/x-platform-connectors/src/index.js');

let XEcosystem, XEcosystemConfig, XTenant, X_PERMISSIONS;
let XGovernanceRuntime, XProtocolRegistry, XPlatformRegistry;
let XMicrobotOrchestrator, XMissionDispatch, X_MISSION_TYPES;
let XPlatformConnector, SquareConnector, ShopifyConnector;
let StripeConnector, QuickBooksConnector, PayPalConnector;
let WooCommerceConnector, GenericRestConnector;

before(async () => {
  const eco = await import(pathToFileURL(ECOSYSTEM_SRC).href);
  XEcosystem            = eco.XEcosystem;
  XEcosystemConfig      = eco.XEcosystemConfig;
  XTenant               = eco.XTenant;
  X_PERMISSIONS         = eco.X_PERMISSIONS;
  XGovernanceRuntime    = eco.XGovernanceRuntime;
  XProtocolRegistry     = eco.XProtocolRegistry;
  XPlatformRegistry     = eco.XPlatformRegistry;
  XMicrobotOrchestrator = eco.XMicrobotOrchestrator;
  XMissionDispatch      = eco.XMissionDispatch;
  X_MISSION_TYPES       = eco.X_MISSION_TYPES;

  const con = await import(pathToFileURL(CONNECTORS_SRC).href);
  XPlatformConnector  = con.XPlatformConnector;
  SquareConnector     = con.SquareConnector;
  ShopifyConnector    = con.ShopifyConnector;
  StripeConnector     = con.StripeConnector;
  QuickBooksConnector = con.QuickBooksConnector;
  PayPalConnector     = con.PayPalConnector;
  WooCommerceConnector= con.WooCommerceConnector;
  GenericRestConnector= con.GenericRestConnector;
});

// ─── XEcosystemConfig ────────────────────────────────────────────────────────

describe('XEcosystemConfig', () => {
  it('creates with defaults', () => {
    const cfg = new XEcosystemConfig();
    assert.equal(cfg.maxConcurrentMissions, 32);
    assert.equal(cfg.enableGovernance, true);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(Object.isFrozen(cfg), true);
  });

  it('accepts overrides', () => {
    const cfg = XEcosystemConfig.from({ maxConcurrentMissions: 4, logLevel: 'debug', enableCache: false });
    assert.equal(cfg.maxConcurrentMissions, 4);
    assert.equal(cfg.logLevel, 'debug');
    assert.equal(cfg.enableCache, false);
  });

  it('throws on invalid maxConcurrentMissions', () => {
    assert.throws(() => new XEcosystemConfig({ maxConcurrentMissions: 0 }), /RangeError|must be/i);
  });

  it('throws on invalid logLevel', () => {
    assert.throws(() => new XEcosystemConfig({ logLevel: 'verbose' }), /RangeError|logLevel/i);
  });

  it('throws on missionTimeoutMs < 1000', () => {
    assert.throws(() => new XEcosystemConfig({ missionTimeoutMs: 500 }), /RangeError/i);
  });

  it('serialises to JSON', () => {
    const cfg = new XEcosystemConfig();
    const j = cfg.toJSON();
    assert.equal(typeof j.maxTenantsPerInstance, 'number');
    assert.equal(typeof j.enableGovernance, 'boolean');
  });

  it('DEFAULTS is frozen', () => {
    assert.equal(Object.isFrozen(XEcosystemConfig.DEFAULTS), true);
  });
});

// ─── XTenant ─────────────────────────────────────────────────────────────────

describe('XTenant', () => {
  it('creates with defaults', () => {
    const t = new XTenant();
    assert.ok(t.tenantId.startsWith('tenant-'));
    assert.ok(t.userId.startsWith('user-'));
    assert.equal(t.role, 'operator');
  });

  it('creates with explicit ids', () => {
    const t = new XTenant({ tenantId: 'acme', userId: 'alice', role: 'admin' });
    assert.equal(t.tenantId, 'acme');
    assert.equal(t.userId, 'alice');
    assert.equal(t.role, 'admin');
  });

  it('operator hasPermission mission:execute', () => {
    const t = new XTenant({ role: 'operator' });
    assert.equal(t.hasPermission('mission:execute'), true);
  });

  it('viewer lacks mission:execute', () => {
    const t = new XTenant({ role: 'viewer' });
    assert.equal(t.hasPermission('mission:execute'), false);
  });

  it('admin has all permissions', () => {
    const t = new XTenant({ role: 'admin' });
    assert.equal(t.hasPermission('mission:execute'), true);
    assert.equal(t.hasPermission('governance:write'), true);
    assert.equal(t.hasPermission('audit:read'), true);
  });

  it('canAccessPlatform wildcard', () => {
    const t = new XTenant({ platformAccess: ['*'] });
    assert.equal(t.canAccessPlatform('square'), true);
    assert.equal(t.canAccessPlatform('shopify'), true);
  });

  it('canAccessPlatform restricted', () => {
    const t = new XTenant({ platformAccess: ['square'] });
    assert.equal(t.canAccessPlatform('square'), true);
    assert.equal(t.canAccessPlatform('shopify'), false);
  });

  it('serialises to JSON', () => {
    const t = new XTenant({ tenantId: 'acme' });
    const j = t.toJSON();
    assert.equal(j.tenantId, 'acme');
    assert.ok(Array.isArray(j.permissions));
  });

  it('X_PERMISSIONS is frozen object', () => {
    assert.equal(Object.isFrozen(X_PERMISSIONS), true);
    assert.ok(X_PERMISSIONS.MISSION_EXECUTE);
  });
});

// ─── XGovernanceRuntime ──────────────────────────────────────────────────────

describe('XGovernanceRuntime', () => {
  it('allows a valid mission', () => {
    const gov = new XGovernanceRuntime();
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    assert.doesNotThrow(() => gov.enforce({ missionId: 'x', type: 'git:scan', tenant, platforms: [] }));
  });

  it('rejects mission with no tenant', () => {
    const gov = new XGovernanceRuntime();
    assert.throws(
      () => gov.enforce({ missionId: 'x', type: 'git:scan', tenant: null, platforms: [] }),
      /rejected|no tenant/i,
    );
  });

  it('rejects viewer without execute permission', () => {
    const gov    = new XGovernanceRuntime();
    const tenant = new XTenant({ tenantId: 'acme', role: 'viewer' });
    assert.throws(
      () => gov.enforce({ missionId: 'x', type: 'git:scan', tenant, platforms: [] }),
      /rejected|lacks permission/i,
    );
  });

  it('rejects platform the tenant cannot access', () => {
    const gov    = new XGovernanceRuntime();
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator', platformAccess: ['square'] });
    assert.throws(
      () => gov.enforce({ missionId: 'x', type: 'git:scan', tenant, platforms: ['shopify'] }),
      /rejected|cannot access/i,
    );
  });

  it('builds a hash chain', () => {
    const gov = new XGovernanceRuntime();
    gov.audit('test-event-a', { tenantId: 'acme' }, { step: 1 });
    gov.audit('test-event-b', { tenantId: 'acme' }, { step: 2 });
    const chain = gov.getAuditChain();
    assert.equal(chain.length, 2);
    assert.ok(chain[0].hash);
    assert.equal(chain[1].prevHash, chain[0].hash);
  });

  it('verifyChain returns valid:true for untampered chain', () => {
    const gov = new XGovernanceRuntime();
    gov.audit('event-1', {}, {});
    gov.audit('event-2', {}, {});
    const { valid } = gov.verifyChain();
    assert.equal(valid, true);
  });

  it('custom policy can reject', () => {
    const gov = new XGovernanceRuntime();
    gov.addPolicy(() => 'blocked by custom policy');
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    assert.throws(
      () => gov.enforce({ missionId: 'x', type: 'git:scan', tenant, platforms: [] }),
      /blocked by custom policy/i,
    );
  });

  it('rate limit triggers after threshold', () => {
    const gov    = new XGovernanceRuntime({ rateLimitMaxRequests: 2 });
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    const mission = { missionId: 'x', type: 'git:scan', tenant, platforms: [] };
    gov.enforce(mission); // 1
    gov.enforce(mission); // 2
    assert.throws(() => gov.enforce(mission), /rate limit/i);
  });
});

// ─── XProtocolRegistry ───────────────────────────────────────────────────────

describe('XProtocolRegistry', () => {
  it('registers and retrieves a protocol', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'proto-1', name: 'MyProto', domain: 'commerce', capabilities: ['forecast'] });
    const p = reg.get('proto-1');
    assert.equal(p.name, 'MyProto');
    assert.equal(p.domain, 'commerce');
  });

  it('throws without id or name', () => {
    const reg = new XProtocolRegistry();
    assert.throws(() => reg.register({ name: 'X' }), /id/i);
    assert.throws(() => reg.register({ id: 'x' }), /name/i);
  });

  it('byDomain returns correct protocols', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'c1', name: 'C1', domain: 'commerce' });
    reg.register({ id: 'c2', name: 'C2', domain: 'commerce' });
    reg.register({ id: 'r1', name: 'R1', domain: 'research' });
    assert.equal(reg.byDomain('commerce').length, 2);
    assert.equal(reg.byDomain('research').length, 1);
  });

  it('byCapability returns correct protocols', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'f1', name: 'F1', capabilities: ['forecast', 'segment'] });
    reg.register({ id: 'f2', name: 'F2', capabilities: ['forecast'] });
    assert.equal(reg.byCapability('forecast').length, 2);
    assert.equal(reg.byCapability('segment').length, 1);
  });

  it('search finds by name and description', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'x', name: 'PhiResonance', description: 'resonance sync protocol' });
    assert.ok(reg.search('phi').length > 0);
    assert.ok(reg.search('resonance').length > 0);
    assert.equal(reg.search('notfound').length, 0);
  });

  it('bulk registerAll works', () => {
    const reg = new XProtocolRegistry();
    reg.registerAll([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
    ]);
    assert.equal(reg.list().length, 3);
  });

  it('unregister removes a protocol', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'to-remove', name: 'Remove Me' });
    reg.unregister('to-remove');
    assert.equal(reg.get('to-remove'), null);
  });

  it('setHealth updates protocol health', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 'hp', name: 'HP' });
    reg.setHealth('hp', 'degraded');
    assert.equal(reg.get('hp').health, 'degraded');
  });

  it('stats returns correct totals', () => {
    const reg = new XProtocolRegistry();
    reg.register({ id: 's1', name: 'S1', domain: 'commerce' });
    reg.register({ id: 's2', name: 'S2', domain: 'ops' });
    const s = reg.stats();
    assert.equal(s.total, 2);
    assert.equal(s.healthy, 2);
    assert.ok(s.byDomain.commerce);
  });
});

// ─── XPlatformRegistry ───────────────────────────────────────────────────────

describe('XPlatformRegistry', () => {
  const makeAdapter = () => ({ execute: async () => ({ ok: true }), health: async () => {} });

  it('registers and resolves an adapter', () => {
    const reg = new XPlatformRegistry();
    reg.register('square', makeAdapter(), { capabilities: ['payments'] });
    const e = reg.resolve('square');
    assert.equal(e.name, 'square');
  });

  it('throws when resolving unknown platform', () => {
    const reg = new XPlatformRegistry();
    assert.throws(() => reg.resolve('unknown'), /not registered/i);
  });

  it('throws if adapter missing execute()', () => {
    const reg = new XPlatformRegistry();
    assert.throws(() => reg.register('bad', {}), /must implement execute/i);
  });

  it('has() checks presence', () => {
    const reg = new XPlatformRegistry();
    reg.register('square', makeAdapter());
    assert.equal(reg.has('square'), true);
    assert.equal(reg.has('stripe'), false);
  });

  it('withCapability filters adapters', () => {
    const reg = new XPlatformRegistry();
    reg.register('sq', makeAdapter(), { capabilities: ['payments', 'orders'] });
    reg.register('pp', makeAdapter(), { capabilities: ['payments'] });
    assert.equal(reg.withCapability('payments').length, 2);
    assert.equal(reg.withCapability('orders').length, 1);
  });

  it('list excludes adapter instance', () => {
    const reg = new XPlatformRegistry();
    reg.register('square', makeAdapter());
    const listed = reg.list();
    assert.equal(listed[0].adapter, undefined);
    assert.equal(listed[0].name, 'square');
  });

  it('unregister removes adapter', () => {
    const reg = new XPlatformRegistry();
    reg.register('square', makeAdapter());
    reg.unregister('square');
    assert.equal(reg.has('square'), false);
  });

  it('probeAll returns health results', async () => {
    const reg = new XPlatformRegistry();
    reg.register('square', makeAdapter(), { capabilities: ['payments'] });
    const results = await reg.probeAll();
    assert.equal(results[0].name, 'square');
    assert.equal(results[0].status, 'healthy');
  });
});

// ─── XMicrobotOrchestrator ───────────────────────────────────────────────────

describe('XMicrobotOrchestrator', () => {
  const makeBot = (result = { done: true }) => ({
    run: async () => result,
    stop: () => {},
  });

  it('spawns and lists a bot', () => {
    const orch = new XMicrobotOrchestrator();
    const botId = orch.spawn(makeBot(), { tenantId: 'acme' });
    assert.ok(botId);
    const listed = orch.list('acme');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].botId, botId);
  });

  it('throws if bot missing run()', () => {
    const orch = new XMicrobotOrchestrator();
    assert.throws(() => orch.spawn({ stop: () => {} }), /must implement run/i);
  });

  it('dispatch returns bot result', async () => {
    const orch  = new XMicrobotOrchestrator();
    const botId = orch.spawn(makeBot({ value: 42 }), { tenantId: 'acme' });
    const res   = await orch.dispatch(botId, { op: 'test' });
    assert.equal(res.value, 42);
  });

  it('dispatch retries on failure then succeeds', async () => {
    const orch  = new XMicrobotOrchestrator();
    let calls   = 0;
    const bot   = { run: async () => { calls++; if (calls < 2) throw new Error('fail'); return { ok: true }; }, stop: () => {} };
    const botId = orch.spawn(bot, { tenantId: 'acme' });
    const res   = await orch.dispatch(botId, {}, { backoffMs: 5 });
    assert.equal(res.ok, true);
    assert.equal(calls, 2);
  });

  it('broadcast fans out to all tenant bots', async () => {
    const orch = new XMicrobotOrchestrator();
    orch.spawn(makeBot({ a: 1 }), { tenantId: 'acme' });
    orch.spawn(makeBot({ b: 2 }), { tenantId: 'acme' });
    const results = await orch.broadcast('acme', { op: 'ping' });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.success));
  });

  it('despawn removes bot from fleet', () => {
    const orch  = new XMicrobotOrchestrator();
    const botId = orch.spawn(makeBot(), { tenantId: 'acme' });
    orch.despawn(botId);
    assert.equal(orch.list('acme').length, 0);
  });

  it('enforces maxBotsTotal', () => {
    const orch = new XMicrobotOrchestrator({ maxBotsTotal: 2 });
    orch.spawn(makeBot(), { tenantId: 'acme' });
    orch.spawn(makeBot(), { tenantId: 'acme' });
    assert.throws(() => orch.spawn(makeBot(), { tenantId: 'acme' }), /max total bots/i);
  });

  it('status() reports totals', () => {
    const orch  = new XMicrobotOrchestrator();
    orch.spawn(makeBot(), { tenantId: 't1' });
    orch.spawn(makeBot(), { tenantId: 't2' });
    const s = orch.status();
    assert.equal(s.total, 2);
    assert.equal(s.tenants, 2);
  });
});

// ─── XMissionDispatch ────────────────────────────────────────────────────────

describe('XMissionDispatch', () => {
  it('creates and executes a mission', async () => {
    const dispatch = new XMissionDispatch();
    dispatch.register('git:scan', async () => ({ files: 10 }));
    const tenant  = new XTenant({ tenantId: 'acme', role: 'operator' });
    const mission = dispatch.create({ type: 'git:scan', tenant });
    const result  = await dispatch.execute(mission.missionId);
    assert.equal(result.status, 'completed');
    assert.equal(result.result.files, 10);
  });

  it('run() is shorthand for create + execute', async () => {
    const dispatch = new XMissionDispatch();
    dispatch.register('commerce:sync', async () => ({ synced: true }));
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    const result = await dispatch.run({ type: 'commerce:sync', tenant });
    assert.equal(result.status, 'completed');
  });

  it('fails gracefully on handler error', async () => {
    const dispatch = new XMissionDispatch();
    dispatch.register('ops:health', async () => { throw new Error('service down'); });
    const tenant  = new XTenant({ tenantId: 'acme', role: 'operator' });
    const mission = dispatch.create({ type: 'ops:health', tenant });
    await assert.rejects(() => dispatch.execute(mission.missionId), /service down/i);
    assert.equal(dispatch.get(mission.missionId).status, 'failed');
  });

  it('throws if no handler for type', async () => {
    const dispatch = new XMissionDispatch();
    const tenant   = new XTenant({ tenantId: 'acme', role: 'operator' });
    const mission  = dispatch.create({ type: 'unknown:type', tenant });
    await assert.rejects(() => dispatch.execute(mission.missionId), /No handler/i);
  });

  it('list() filters by tenantId', async () => {
    const dispatch = new XMissionDispatch();
    dispatch.register('git:scan', async () => ({}));
    const t1 = new XTenant({ tenantId: 'acme', role: 'operator' });
    const t2 = new XTenant({ tenantId: 'beta', role: 'operator' });
    await dispatch.run({ type: 'git:scan', tenant: t1 });
    await dispatch.run({ type: 'git:scan', tenant: t2 });
    assert.equal(dispatch.list({ tenantId: 'acme' }).length, 1);
  });

  it('stats() returns correct counts', async () => {
    const dispatch = new XMissionDispatch();
    dispatch.register('git:scan', async () => ({}));
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    await dispatch.run({ type: 'git:scan', tenant });
    const s = dispatch.stats();
    assert.ok(s.total >= 1);
    assert.ok(s.completed >= 1);
  });

  it('rejects invalid priority', () => {
    const dispatch = new XMissionDispatch();
    const tenant = new XTenant({ tenantId: 'acme', role: 'operator' });
    assert.throws(
      () => dispatch.create({ type: 'git:scan', tenant, priority: 'extreme' }),
      /priority/i,
    );
  });

  it('X_MISSION_TYPES includes git and commerce types', () => {
    assert.ok(X_MISSION_TYPES.GIT_SCAN);
    assert.ok(X_MISSION_TYPES.COMMERCE_SYNC);
    assert.ok(X_MISSION_TYPES.PLATFORM_PROBE);
  });
});

// ─── XEcosystem integration ──────────────────────────────────────────────────

describe('XEcosystem', () => {
  it('creates with defaults', () => {
    const x = new XEcosystem();
    assert.ok(x.config instanceof XEcosystemConfig);
    assert.ok(x.protocols instanceof XProtocolRegistry);
    assert.ok(x.platforms instanceof XPlatformRegistry);
    assert.ok(x.microbots instanceof XMicrobotOrchestrator);
  });

  it('createTenant and getTenant', () => {
    const x = new XEcosystem();
    const t = x.createTenant({ tenantId: 'acme', userId: 'alice', role: 'operator' });
    assert.equal(t.tenantId, 'acme');
    const t2 = x.getTenant('acme');
    assert.equal(t2.tenantId, 'acme');
  });

  it('getTenant throws for unknown tenant', () => {
    const x = new XEcosystem();
    assert.throws(() => x.getTenant('ghost'), /not found/i);
  });

  it('removeTenant removes it', () => {
    const x = new XEcosystem();
    x.createTenant({ tenantId: 'temp' });
    x.removeTenant('temp');
    assert.throws(() => x.getTenant('temp'), /not found/i);
  });

  it('dispatch executes a mission and returns result', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('git:scan', async () => ({ nodes: 42 }));
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const result = await x.dispatch(tenant, 'git:scan');
    assert.equal(result.status, 'completed');
    assert.equal(result.result.nodes, 42);
  });

  it('dispatch emits mission:start and mission:complete events', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('commerce:sync', async () => ({ synced: true }));
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const events = [];
    x.on('mission:start',    (e) => events.push(e.type + ':start'));
    x.on('mission:complete', (e) => events.push(e.type + ':complete'));
    await x.dispatch(tenant, 'commerce:sync');
    assert.ok(events.includes('commerce:sync:start'));
    assert.ok(events.includes('commerce:sync:complete'));
  });

  it('dispatch emits mission:error on failure', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('ops:health', async () => { throw new Error('boom'); });
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    let errEvent;
    x.on('mission:error', (e) => { errEvent = e; });
    await assert.rejects(() => x.dispatch(tenant, 'ops:health'), /boom/i);
    assert.ok(errEvent?.error);
  });

  it('governance blocks viewer from executing missions', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('git:scan', async () => ({}));
    const viewer = x.createTenant({ tenantId: 'v1', role: 'viewer' });
    await assert.rejects(() => x.dispatch(viewer, 'git:scan'), /rejected|lacks permission/i);
  });

  it('dispatchAll fans out to multiple tenants', async () => {
    const x = new XEcosystem({ config: { enableGovernance: false } });
    x.registerMissionHandler('git:digest', async (m) => ({ tenantId: m.tenantId }));
    const t1 = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const t2 = x.createTenant({ tenantId: 'beta', role: 'operator' });
    const results = await x.dispatchAll([t1, t2], 'git:digest');
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.success));
  });

  it('spawnMicrobot emits microbot:spawned', () => {
    const x      = new XEcosystem();
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const bot    = { run: async () => ({}), stop: () => {} };
    let event;
    x.on('microbot:spawned', (e) => { event = e; });
    x.spawnMicrobot(tenant, bot);
    assert.ok(event?.botId);
    assert.equal(event.tenantId, 'acme');
  });

  it('status() returns full snapshot', () => {
    const x = new XEcosystem();
    x.createTenant({ tenantId: 'acme', role: 'operator' });
    const s = x.status();
    assert.equal(s.tenants, 1);
    assert.ok(typeof s.missions === 'object');
    assert.ok(typeof s.protocols === 'object');
  });

  it('listMissions filters by tenantId', async () => {
    const x = new XEcosystem({ config: { enableGovernance: false } });
    x.registerMissionHandler('git:scan', async () => ({}));
    const t1 = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const t2 = x.createTenant({ tenantId: 'beta', role: 'operator' });
    await x.dispatch(t1, 'git:scan');
    await x.dispatch(t2, 'git:scan');
    assert.equal(x.listMissions({ tenantId: 'acme' }).length, 1);
  });

  it('XEcosystem.missionTypes exposes X_MISSION_TYPES', () => {
    assert.ok(XEcosystem.missionTypes.GIT_SCAN);
    assert.ok(XEcosystem.missionTypes.COMMERCE_SYNC);
  });

  it('destroy() removes all listeners', () => {
    const x = new XEcosystem();
    x.on('mission:start', () => {});
    x.destroy();
    assert.equal(x.listenerCount('mission:start'), 0);
  });
});

// ─── XPlatformConnector (base) ───────────────────────────────────────────────

describe('XPlatformConnector', () => {
  it('throws without name', () => {
    assert.throws(() => new XPlatformConnector({ name: '' }), /name/i);
  });

  it('execute delegates to _operations()', async () => {
    class TestConnector extends XPlatformConnector {
      constructor() { super({ name: 'test', capabilities: ['echo'] }); }
      _operations() { return { echo: (p) => ({ echoed: p.msg }) }; }
    }
    const c = new TestConnector();
    const r = await c.execute('echo', { msg: 'hello' });
    assert.equal(r.echoed, 'hello');
  });

  it('execute throws on unknown operation', async () => {
    class TestConnector extends XPlatformConnector {
      constructor() { super({ name: 'test' }); }
      _operations() { return {}; }
    }
    const c = new TestConnector();
    await assert.rejects(() => c.execute('noop'), /unknown operation/i);
  });

  it('connect() sets isConnected', async () => {
    class TestConnector extends XPlatformConnector {
      constructor() { super({ name: 'test' }); }
    }
    const c = new TestConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
    await c.disconnect();
    assert.equal(c.isConnected, false);
  });
});

// ─── SquareConnector ─────────────────────────────────────────────────────────

describe('SquareConnector', () => {
  it('connects without credentials', async () => {
    const c = new SquareConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('throws with malformed accessToken', async () => {
    const c = new SquareConnector({ accessToken: 'bad-token' });
    await assert.rejects(() => c.connect(), /malformed/i);
  });

  it('payments.list returns stub', async () => {
    const c = new SquareConnector();
    await c.connect();
    const r = await c.execute('payments.list', { limit: 5 });
    assert.equal(r.platform, 'square');
    assert.ok(Array.isArray(r.payments));
  });

  it('catalog.list returns stub', async () => {
    const c = new SquareConnector();
    await c.connect();
    const r = await c.execute('catalog.list');
    assert.equal(r.platform, 'square');
  });

  it('reports.sales returns stub', async () => {
    const c = new SquareConnector();
    await c.connect();
    const r = await c.execute('reports.sales');
    assert.ok('totalSales' in r.summary);
  });

  it('locations.list returns stub', async () => {
    const c = new SquareConnector();
    await c.connect();
    const r = await c.execute('locations.list');
    assert.equal(r.platform, 'square');
  });
});

// ─── ShopifyConnector ────────────────────────────────────────────────────────

describe('ShopifyConnector', () => {
  it('connects without credentials', async () => {
    const c = new ShopifyConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('products.list returns stub', async () => {
    const c = new ShopifyConnector();
    await c.connect();
    const r = await c.execute('products.list');
    assert.equal(r.platform, 'shopify');
  });

  it('orders.list returns stub', async () => {
    const c = new ShopifyConnector();
    await c.connect();
    const r = await c.execute('orders.list');
    assert.equal(r.platform, 'shopify');
  });

  it('analytics.sales returns stub', async () => {
    const c = new ShopifyConnector();
    await c.connect();
    const r = await c.execute('analytics.sales');
    assert.ok('totalRevenue' in r.summary);
  });
});

// ─── StripeConnector ─────────────────────────────────────────────────────────

describe('StripeConnector', () => {
  it('throws with bad secretKey format', async () => {
    const c = new StripeConnector({ secretKey: 'rk_bad' });
    await assert.rejects(() => c.connect(), /must start with sk_/i);
  });

  it('payments.create returns stub', async () => {
    const c = new StripeConnector();
    await c.connect();
    const r = await c.execute('payments.create', { amount: 5000, currency: 'usd' });
    assert.equal(r.platform, 'stripe');
    assert.equal(r.status, 'requires_capture');
  });

  it('subscriptions.create returns stub', async () => {
    const c = new StripeConnector();
    await c.connect();
    const r = await c.execute('subscriptions.create', { customer: 'cus_123' });
    assert.equal(r.status, 'active');
  });

  it('balance.retrieve returns stub', async () => {
    const c = new StripeConnector();
    await c.connect();
    const r = await c.execute('balance.retrieve');
    assert.equal(r.platform, 'stripe');
  });
});

// ─── QuickBooksConnector ─────────────────────────────────────────────────────

describe('QuickBooksConnector', () => {
  it('connects', async () => {
    const c = new QuickBooksConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('reports.profit-loss returns stub', async () => {
    const c = new QuickBooksConnector();
    await c.connect();
    const r = await c.execute('reports.profit-loss', {});
    assert.equal(r.report, 'ProfitAndLoss');
  });

  it('invoices.create returns stub', async () => {
    const c = new QuickBooksConnector();
    await c.connect();
    const r = await c.execute('invoices.create', { TotalAmt: 100 });
    assert.equal(r.Invoice.Id, 'qb-inv-stub');
  });
});

// ─── PayPalConnector ─────────────────────────────────────────────────────────

describe('PayPalConnector', () => {
  it('connects', async () => {
    const c = new PayPalConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('orders.create returns stub', async () => {
    const c = new PayPalConnector();
    await c.connect();
    const r = await c.execute('orders.create', { intent: 'CAPTURE' });
    assert.equal(r.status, 'CREATED');
  });

  it('subscriptions.create returns stub', async () => {
    const c = new PayPalConnector();
    await c.connect();
    const r = await c.execute('subscriptions.create', { plan_id: 'P-123' });
    assert.equal(r.status, 'ACTIVE');
  });
});

// ─── WooCommerceConnector ────────────────────────────────────────────────────

describe('WooCommerceConnector', () => {
  it('connects', async () => {
    const c = new WooCommerceConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('products.list returns stub', async () => {
    const c = new WooCommerceConnector();
    await c.connect();
    const r = await c.execute('products.list');
    assert.equal(r.platform, 'woocommerce');
  });

  it('reports.sales returns stub', async () => {
    const c = new WooCommerceConnector();
    await c.connect();
    const r = await c.execute('reports.sales');
    assert.ok('total_sales' in r.totals);
  });
});

// ─── End-to-end: XEcosystem + platform connectors ───────────────────────────

describe('XEcosystem + platform connectors (e2e)', () => {
  it('commerce:sync mission with square adapter', async () => {
    const x = new XEcosystem({ config: { enableGovernance: false } });
    const square = new SquareConnector();
    await square.connect();
    x.platforms.register('square', square, { capabilities: ['payments', 'orders'] });

    x.registerMissionHandler('commerce:sync', async (mission) => {
      const platform = x.platforms.resolve(mission.platform_targets[0] ?? 'square');
      return platform.adapter.execute('orders.list', {});
    });

    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const result = await x.dispatch(tenant, 'commerce:sync', { platform_targets: ['square'] });
    assert.equal(result.status, 'completed');
    assert.equal(result.result.platform, 'square');
  });

  it('protocol registry wired into ecosystem', () => {
    const x = new XEcosystem();
    x.protocols.registerAll([
      { id: 'sovereign-routing', name: 'SovereignRouting', domain: 'routing', capabilities: ['route'] },
      { id: 'phi-sync',         name: 'PhiResonanceSync',  domain: 'sync',    capabilities: ['sync'] },
    ]);
    assert.equal(x.protocols.stats().total, 2);
    assert.ok(x.protocols.byCapability('route').length > 0);
  });

  it('audit chain grows with each dispatched mission', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('git:scan', async () => ({}));
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    const before = x.governance.getAuditChain().length;
    await x.dispatch(tenant, 'git:scan');
    assert.ok(x.governance.getAuditChain().length > before);
  });

  it('audit chain verifies as valid after mission', async () => {
    const x = new XEcosystem();
    x.registerMissionHandler('git:digest', async () => ({}));
    const tenant = x.createTenant({ tenantId: 'acme', role: 'operator' });
    await x.dispatch(tenant, 'git:digest');
    const { valid } = x.governance.verifyChain();
    assert.equal(valid, true);
  });
});
