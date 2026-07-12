/**
 * Test suite: Operations Sub-Protocols (PROTO-O001 – PROTO-O008)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { HealthMonitoringProtocol, HEALTH_STATUS }                          from '../../protocols/operations/health-monitoring-protocol.js';
import { AlertRoutingProtocol, SEVERITY }                                   from '../../protocols/operations/alert-routing-protocol.js';
import { PerformanceOptimizationProtocol, PERF_STATUS }                     from '../../protocols/operations/performance-optimization-protocol.js';
import { DeploymentOrchestrationProtocol, DEPLOY_STATUS, DEPLOY_STRATEGY }  from '../../protocols/operations/deployment-orchestration-protocol.js';
import { SecurityGatewayProtocol, THREAT_LEVEL, ACCESS_RESULT }             from '../../protocols/operations/security-gateway-protocol.js';
import { ComplianceAuditProtocol, COMPLIANCE_STATUS }                       from '../../protocols/operations/compliance-audit-protocol.js';
import { ResourceAllocationProtocol, ALLOCATION_STATUS }                    from '../../protocols/operations/resource-allocation-protocol.js';
import { KnowledgeSynthesisProtocol, KNOWLEDGE_TYPE }                       from '../../protocols/operations/knowledge-synthesis-protocol.js';

// ─── PROTO-O001: Health Monitoring ───────────────────────────────────────────
describe('HealthMonitoringProtocol', () => {
  it('starts with empty history', () => {
    const hmp = new HealthMonitoringProtocol();
    assert.equal(hmp.history.length, 0);
  });

  it('pulse with no checks returns healthy score 1', async () => {
    const hmp = new HealthMonitoringProtocol();
    const result = await hmp.pulse();
    assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    assert.equal(result.score, 1);
  });

  it('failing critical check drives status down', async () => {
    const hmp = new HealthMonitoringProtocol();
    hmp.registerCheck('db', async () => ({ ok: false }), { critical: true, weight: 1 });
    const result = await hmp.pulse();
    assert.ok(result.score < 0.5);
  });

  it('trend returns stable for single entry', async () => {
    const hmp = new HealthMonitoringProtocol();
    await hmp.pulse();
    const { trend } = hmp.trend();
    assert.equal(trend, 'stable');
  });

  it('metrics.pulses increments', async () => {
    const hmp = new HealthMonitoringProtocol();
    await hmp.pulse();
    await hmp.pulse();
    assert.equal(hmp.metrics.pulses, 2);
  });

  it('check error counts as failure', async () => {
    const hmp = new HealthMonitoringProtocol();
    hmp.registerCheck('broken', async () => { throw new Error('kaboom'); }, { weight: 1 });
    const result = await hmp.pulse();
    assert.equal(result.checks.broken.ok, false);
  });
});

// ─── PROTO-O002: Alert Routing ────────────────────────────────────────────────
describe('AlertRoutingProtocol', () => {
  it('routes alert to registered handler', () => {
    const arp = new AlertRoutingProtocol();
    const received = [];
    arp.registerRoute(SEVERITY.ERROR, { name: 'test', deliver: (a) => received.push(a) });
    const result = arp.route({ source: 's', severity: SEVERITY.ERROR, title: 'disk full' });
    assert.ok(result.routed);
    assert.equal(received.length, 1);
  });

  it('deduplicates within window', () => {
    const arp = new AlertRoutingProtocol({ dedupWindowMs: 60_000 });
    arp.registerRoute(SEVERITY.WARNING, { name: 'h', deliver: () => {} });
    arp.route({ source: 's', severity: SEVERITY.WARNING, title: 'same' });
    const second = arp.route({ source: 's', severity: SEVERITY.WARNING, title: 'same' });
    assert.equal(second.reason, 'deduplicated');
  });

  it('suppression rule works', () => {
    const arp = new AlertRoutingProtocol({ suppressionRules: [(a) => a.severity === SEVERITY.INFO] });
    const result = arp.route({ source: 's', severity: SEVERITY.INFO, title: 'noise' });
    assert.equal(result.reason, 'suppressed');
  });

  it('CRITICAL escalates to WARNING handlers', () => {
    const arp = new AlertRoutingProtocol();
    const received = [];
    arp.registerRoute(SEVERITY.WARNING, { name: 'warn', deliver: (a) => received.push(a) });
    arp.route({ source: 's', severity: SEVERITY.CRITICAL, title: 'fire' });
    assert.equal(received.length, 1);
  });

  it('priorityScore is higher for CRITICAL', () => {
    const arp = new AlertRoutingProtocol();
    const ts = new Date().toISOString();
    const crit = arp.priorityScore({ severity: SEVERITY.CRITICAL, timestamp: ts });
    const info = arp.priorityScore({ severity: SEVERITY.INFO,     timestamp: ts });
    assert.ok(crit > info);
  });
});

// ─── PROTO-O003: Performance Optimization ────────────────────────────────────
describe('PerformanceOptimizationProtocol', () => {
  it('profile returns OPTIMAL for no samples', () => {
    const pop = new PerformanceOptimizationProtocol();
    const p = pop.profile();
    assert.equal(p.status, PERF_STATUS.OPTIMAL);
  });

  it('high latency samples produce DEGRADED status', () => {
    const pop = new PerformanceOptimizationProtocol({ targetP95Ms: 100 });
    for (let i = 0; i < 5; i++) pop.record({ latencyMs: 500, cpuPct: 40, memPct: 50, throughput: 100 });
    const p = pop.profile();
    assert.ok(p.status !== PERF_STATUS.OPTIMAL);
  });

  it('detectBottlenecks returns high_latency', () => {
    const pop = new PerformanceOptimizationProtocol({ targetP95Ms: 50 });
    for (let i = 0; i < 5; i++) pop.record({ latencyMs: 400, cpuPct: 30, memPct: 30, throughput: 50 });
    const b = pop.detectBottlenecks();
    assert.ok(b.some((x) => x.bottleneck === 'high_latency'));
  });

  it('suggestTuning produces connection pool suggestion under high latency', () => {
    const pop = new PerformanceOptimizationProtocol({ targetP95Ms: 50 });
    for (let i = 0; i < 5; i++) pop.record({ latencyMs: 300, cpuPct: 20, memPct: 20, throughput: 50 });
    const suggestions = pop.suggestTuning();
    assert.ok(suggestions.length > 0);
  });

  it('metrics.profiles increments on record', () => {
    const pop = new PerformanceOptimizationProtocol();
    pop.record({ latencyMs: 10, cpuPct: 5, memPct: 5, throughput: 1000 });
    assert.equal(pop.metrics.profiles, 1);
  });
});

// ─── PROTO-O004: Deployment Orchestration ────────────────────────────────────
describe('DeploymentOrchestrationProtocol', () => {
  it('initiates deployment', () => {
    const dop = new DeploymentOrchestrationProtocol();
    const { status } = dop.initiate({ id: 'd1', service: 'api', version: '2.0.0' });
    assert.equal(status, DEPLOY_STATUS.PENDING);
  });

  it('advances canary', () => {
    const dop = new DeploymentOrchestrationProtocol();
    dop.initiate({ id: 'd2', service: 'api', version: '2.0.0' });
    const { canaryPct } = dop.advanceCanary('d2', 25);
    assert.equal(canaryPct, 25);
  });

  it('promotes when all gates pass', async () => {
    const dop = new DeploymentOrchestrationProtocol();
    dop.registerGate({ name: 'smoke', check: async () => ({ pass: true }) });
    dop.initiate({ id: 'd3', service: 'api', version: '2.0.0' });
    const { promoted } = await dop.evaluate('d3');
    assert.ok(promoted);
  });

  it('rolls back on gate failure', async () => {
    const dop = new DeploymentOrchestrationProtocol({ rollbackOnError: true });
    dop.registerGate({ name: 'fail', check: async () => ({ pass: false, reason: 'test failed' }) });
    dop.initiate({ id: 'd4', service: 'api', version: '2.0.0' });
    const { rolledBack } = await dop.evaluate('d4');
    assert.ok(rolledBack);
  });

  it('riskScore is between 0 and 1', () => {
    const dop = new DeploymentOrchestrationProtocol();
    dop.initiate({ id: 'd5', service: 'api', version: '2.0.0' });
    const score = dop.riskScore('d5');
    assert.ok(score >= 0 && score <= 1);
  });
});

// ─── PROTO-O005: Security Gateway ─────────────────────────────────────────────
describe('SecurityGatewayProtocol', () => {
  it('allows a clean request', () => {
    const sgp = new SecurityGatewayProtocol();
    const { result } = sgp.evaluate({ identity: 'user-1', path: '/api/data' });
    assert.equal(result, ACCESS_RESULT.ALLOWED);
  });

  it('blocks a blocklisted identity', () => {
    const sgp = new SecurityGatewayProtocol();
    sgp.block('bad-actor');
    const { result } = sgp.evaluate({ identity: 'bad-actor' });
    assert.equal(result, ACCESS_RESULT.BLOCKED);
  });

  it('throttles after rate limit', () => {
    const sgp = new SecurityGatewayProtocol({ rateLimitMax: 3, rateLimitWindow: 60_000 });
    for (let i = 0; i < 3; i++) sgp.evaluate({ identity: 'spammer', path: '/' });
    const { result } = sgp.evaluate({ identity: 'spammer', path: '/' });
    assert.equal(result, ACCESS_RESULT.THROTTLED);
  });

  it('allowlisted identity bypasses rate limit', () => {
    const sgp = new SecurityGatewayProtocol({ rateLimitMax: 1 });
    sgp.allow('trusted');
    sgp.evaluate({ identity: 'trusted', path: '/' });
    const { result } = sgp.evaluate({ identity: 'trusted', path: '/' });
    assert.equal(result, ACCESS_RESULT.ALLOWED);
  });

  it('suspicious path raises threat score', () => {
    const sgp = new SecurityGatewayProtocol();
    const { threatScore } = sgp.evaluate({ identity: 'x', path: '/etc/passwd' });
    assert.ok(threatScore > 0);
  });
});

// ─── PROTO-O006: Compliance Audit ────────────────────────────────────────────
describe('ComplianceAuditProtocol', () => {
  it('logs an event and returns hash', () => {
    const cap = new ComplianceAuditProtocol();
    const { entryId, hash } = cap.log({ actor: 'system', action: 'deploy', resource: 'api', outcome: 'success' });
    assert.ok(entryId.startsWith('audit-'));
    assert.equal(hash.length, 64);
  });

  it('verifies chain integrity', () => {
    const cap = new ComplianceAuditProtocol();
    cap.log({ actor: 'a', action: 'read', resource: 'db', outcome: 'success' });
    cap.log({ actor: 'b', action: 'write', resource: 'db', outcome: 'success' });
    assert.ok(cap.verifyChain().valid);
  });

  it('evaluates rules', () => {
    const cap = new ComplianceAuditProtocol();
    cap.registerRule({ id: 'r1', name: 'no-failure', description: '', severity: 'high', check: (e) => e.outcome === 'success' });
    const results = cap.evaluate({ actor: 'x', action: 'write', resource: 'db', outcome: 'failure' });
    assert.equal(results[0].status, COMPLIANCE_STATUS.NON_COMPLIANT);
  });

  it('generates report', () => {
    const cap = new ComplianceAuditProtocol();
    cap.log({ actor: 'a', action: 'read', resource: 'r', outcome: 'success' });
    const report = cap.generateReport();
    assert.ok(report.events >= 1);
  });

  it('query filters by actor', () => {
    const cap = new ComplianceAuditProtocol();
    cap.log({ actor: 'alice', action: 'read', resource: 'r', outcome: 'success' });
    cap.log({ actor: 'bob',   action: 'write', resource: 'r', outcome: 'success' });
    const entries = cap.query({ actor: 'alice' });
    assert.ok(entries.every((e) => e.actor === 'alice'));
  });
});

// ─── PROTO-O007: Resource Allocation ─────────────────────────────────────────
describe('ResourceAllocationProtocol', () => {
  it('allocates to a qualified node', () => {
    const rap = new ResourceAllocationProtocol();
    rap.registerNode({ nodeId: 'n1', cpuCores: 16, memoryGb: 64 });
    const { status, nodeId } = rap.allocate({ id: 'a1', cpuCores: 4, memoryGb: 8 });
    assert.equal(status, ALLOCATION_STATUS.ALLOCATED);
    assert.equal(nodeId, 'n1');
  });

  it('fails when no node has capacity', () => {
    const rap = new ResourceAllocationProtocol();
    rap.registerNode({ nodeId: 'n2', cpuCores: 2, memoryGb: 4 });
    const { status } = rap.allocate({ id: 'a2', cpuCores: 100, memoryGb: 200 });
    assert.equal(status, ALLOCATION_STATUS.FAILED);
  });

  it('release returns resources', () => {
    const rap = new ResourceAllocationProtocol();
    rap.registerNode({ nodeId: 'n3', cpuCores: 8, memoryGb: 16 });
    rap.allocate({ id: 'a3', cpuCores: 4, memoryGb: 8 });
    rap.release('a3');
    const util = rap.clusterUtilization();
    assert.equal(util.allocatedCpu, 0);
  });

  it('clusterUtilization returns correct totals', () => {
    const rap = new ResourceAllocationProtocol();
    rap.registerNode({ nodeId: 'n4', cpuCores: 10, memoryGb: 20 });
    const util = rap.clusterUtilization();
    assert.equal(util.totalCpu, 10);
  });

  it('tag filtering rejects node without required tag', () => {
    const rap = new ResourceAllocationProtocol();
    rap.registerNode({ nodeId: 'n5', cpuCores: 8, memoryGb: 16, tags: ['gpu'] });
    const { status } = rap.allocate({ id: 'a5', cpuCores: 1, memoryGb: 1, tags: ['cpu-only'] });
    assert.equal(status, ALLOCATION_STATUS.FAILED);
  });
});

// ─── PROTO-O008: Knowledge Synthesis ─────────────────────────────────────────
describe('KnowledgeSynthesisProtocol', () => {
  it('ingests a knowledge item', () => {
    const ksp = new KnowledgeSynthesisProtocol();
    const { id, deduplicated } = ksp.ingest({ type: KNOWLEDGE_TYPE.FACT, source: 'sensor', content: 'temperature is 37C', tags: ['health'] });
    assert.ok(id);
    assert.equal(deduplicated, false);
  });

  it('deduplicates same content', () => {
    const ksp = new KnowledgeSynthesisProtocol();
    ksp.ingest({ source: 's', content: 'hello world', type: KNOWLEDGE_TYPE.FACT });
    const { deduplicated } = ksp.ingest({ source: 's', content: 'hello world', type: KNOWLEDGE_TYPE.FACT });
    assert.ok(deduplicated);
  });

  it('query returns results ordered by relevance', () => {
    const ksp = new KnowledgeSynthesisProtocol();
    ksp.ingest({ source: 's', content: 'alpha', tags: ['perf'], type: KNOWLEDGE_TYPE.FACT });
    ksp.ingest({ source: 's', content: 'beta',  tags: ['ops'],  type: KNOWLEDGE_TYPE.FACT });
    const results = ksp.query({ tags: ['perf'] });
    assert.ok(results.length >= 1);
  });

  it('synthesize returns a digest', () => {
    const ksp = new KnowledgeSynthesisProtocol();
    const { id } = ksp.ingest({ source: 's', content: 'CPU spike at 14:00', type: KNOWLEDGE_TYPE.PATTERN, tags: ['perf'] });
    const { digest } = ksp.synthesize([id]);
    assert.ok(digest.includes('CPU spike'));
  });

  it('prune removes low-confidence entries', () => {
    const ksp = new KnowledgeSynthesisProtocol();
    ksp.ingest({ source: 's', content: 'stale fact', type: KNOWLEDGE_TYPE.FACT, confidence: 0.05 });
    const pruned = ksp.prune(0.1);
    assert.ok(pruned >= 1);
  });
});
