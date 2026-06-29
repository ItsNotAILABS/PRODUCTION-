/**
 * Test suite: Platform, Business, and Operations Micro-Agents
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ─── Platform Agents ─────────────────────────────────────────────────────────
const { SquareAgent, ShopifyAgent, StripeAgent, QuickBooksAgent, PayPalAgent, WooCommerceAgent } = require('../../microbots/platform/index.js');

describe('Platform micro-agents — no connector', () => {
  for (const [name, AgentClass] of [['SquareAgent', SquareAgent], ['ShopifyAgent', ShopifyAgent], ['StripeAgent', StripeAgent], ['QuickBooksAgent', QuickBooksAgent], ['PayPalAgent', PayPalAgent], ['WooCommerceAgent', WooCommerceAgent]]) {
    it(`${name} runs without connector and returns error`, async () => {
      const agent = new AgentClass('test-bot');
      const result = await agent.run({});
      assert.ok(result.errors.length > 0 || result.warnings?.length > 0);
    });
  }
});

describe('Platform micro-agents — with stub connector', () => {
  const stubConnector = {
    execute: async (op) => ({ op, data: [], stub: true }),
  };

  it('SquareAgent executes poll operations', async () => {
    const agent = new SquareAgent('test-bot', { connector: stubConnector, pollOps: ['listOrders'] });
    const result = await agent.run({});
    assert.ok('listOrders' in result.operations);
  });

  it('ShopifyAgent executes poll operations', async () => {
    const agent = new ShopifyAgent('test-bot', { connector: stubConnector, pollOps: ['listProducts'] });
    const result = await agent.run({});
    assert.ok('listProducts' in result.operations);
  });

  it('StripeAgent executes poll operations', async () => {
    const agent = new StripeAgent('test-bot', { connector: stubConnector, pollOps: ['getBalance'] });
    const result = await agent.run({});
    assert.ok('getBalance' in result.operations);
  });
});

// ─── Business Agents ─────────────────────────────────────────────────────────
const { SalesMonitorAgent, InventoryWatcherAgent, CustomerAnalyzerAgent, FraudSentinelAgent, RevenueReporterAgent, PricingOptimizerAgent } = require('../../microbots/business/index.js');

describe('Business micro-agents — no protocol', () => {
  it('SalesMonitorAgent warns without protocol', async () => {
    const agent = new SalesMonitorAgent('test-bot');
    const result = await agent.run({});
    assert.ok(result.warnings?.length > 0 || result.insights === null);
  });

  it('FraudSentinelAgent warns without protocol', async () => {
    const agent = new FraudSentinelAgent('test-bot');
    const result = await agent.run({ transactions: [] });
    assert.ok(result.warnings?.length > 0 || result.scores.length === 0);
  });

  it('InventoryWatcherAgent warns without protocol', async () => {
    const agent = new InventoryWatcherAgent('test-bot');
    const result = await agent.run({ items: [] });
    assert.ok(result.warnings?.length > 0 || result.recommendations.length === 0);
  });
});

describe('Business micro-agents — with stub protocol', () => {
  it('SalesMonitorAgent calls analyze', async () => {
    const calls = [];
    const proto = {
      analyze: (txns) => { calls.push('analyze'); return { patterns: [], score: 0.9 }; },
      scoreVelocity: () => ({ velocity: 1 }),
    };
    const agent = new SalesMonitorAgent('bot', { protocol: proto });
    const result = await agent.run({ transactions: [{ amount: 100 }] });
    assert.ok(calls.includes('analyze'));
    assert.ok(result.insights !== null);
  });

  it('FraudSentinelAgent routes transactions', async () => {
    const proto = { score: (txn) => ({ ...txn, riskLevel: 'low', score: 0.1 }) };
    const agent = new FraudSentinelAgent('bot', { protocol: proto });
    const result = await agent.run({ transactions: [{ id: 't1', amount: 50 }] });
    assert.equal(result.scores.length, 1);
    assert.equal(result.flagged.length, 0);
  });

  it('PricingOptimizerAgent categorizes increases and decreases', async () => {
    const proto = {
      optimize: (p) => ({ ...p, recommendedPrice: p.currentPrice * 1.1 }),
    };
    const agent = new PricingOptimizerAgent('bot', { protocol: proto });
    const result = await agent.run({ products: [{ id: 'p1', currentPrice: 100 }] });
    assert.equal(result.increases.length, 1);
    assert.equal(result.decreases.length, 0);
  });
});

// ─── Operations Agents ────────────────────────────────────────────────────────
const { HealthProbeAgent, AlertDispatcherAgent, PerformanceTrackerAgent, ComplianceAuditorAgent } = require('../../microbots/operations/index.js');

describe('Operations micro-agents — no protocol', () => {
  it('HealthProbeAgent alerts without protocol', async () => {
    const agent = new HealthProbeAgent('bot');
    const result = await agent.run({});
    assert.ok(result.alerts.length > 0);
  });

  it('AlertDispatcherAgent fails gracefully without protocol', async () => {
    const agent = new AlertDispatcherAgent('bot');
    const result = await agent.run({ alerts: [] });
    assert.ok(result.failed.length > 0);
  });
});

describe('Operations micro-agents — with stub protocol', () => {
  it('HealthProbeAgent runs pulse', async () => {
    const proto = {
      pulse: async () => ({ status: 'healthy', score: 0.95, checks: {} }),
      trend: () => ({ trend: 'stable', avgScore: 0.95 }),
    };
    const agent = new HealthProbeAgent('bot', { protocol: proto });
    const result = await agent.run({});
    assert.equal(result.pulse.status, 'healthy');
    assert.equal(result.alerts.length, 0);
  });

  it('AlertDispatcherAgent dispatches alerts', async () => {
    const proto = {
      route: (a) => ({ routed: true, reason: 'dispatched', handlers: ['console'] }),
      report: () => ({ metrics: { received: 1 } }),
    };
    const agent = new AlertDispatcherAgent('bot', { protocol: proto });
    const result = await agent.run({ alerts: [{ title: 'disk full', severity: 'error', source: 's' }] });
    assert.equal(result.dispatched.length, 1);
  });

  it('PerformanceTrackerAgent records samples and returns profile', async () => {
    const recorded = [];
    const proto = {
      record: (s) => recorded.push(s),
      profile: () => ({ status: 'optimal', score: 0.95, p95: 50 }),
      detectBottlenecks: () => [],
      suggestTuning: () => [],
    };
    const agent = new PerformanceTrackerAgent('bot', { protocol: proto });
    const result = await agent.run({ samples: [{ latencyMs: 50, cpuPct: 10, memPct: 20, throughput: 1000 }] });
    assert.equal(recorded.length, 1);
    assert.equal(result.profile.status, 'optimal');
  });

  it('ComplianceAuditorAgent logs events and verifies chain', async () => {
    const logged = [];
    const proto = {
      log: (e) => { logged.push(e); return { entryId: 'x', hash: 'abc' }; },
      verifyChain: () => ({ valid: true, entries: 1 }),
      generateReport: () => ({ events: 1, violations: 0, score: 1, rulesSummary: [] }),
    };
    const agent = new ComplianceAuditorAgent('bot', { protocol: proto });
    const result = await agent.run({ events: [{ actor: 'a', action: 'read', resource: 'db', outcome: 'success' }] });
    assert.equal(logged.length, 1);
    assert.ok(result.chainValid);
  });
});

// ─── Index exports ─────────────────────────────────────────────────────────────
describe('Microbot index exports', () => {
  it('platform index exports all 6 agents', () => {
    const idx = require('../../microbots/platform/index.js');
    assert.ok(idx.SquareAgent);
    assert.ok(idx.ShopifyAgent);
    assert.ok(idx.StripeAgent);
    assert.ok(idx.QuickBooksAgent);
    assert.ok(idx.PayPalAgent);
    assert.ok(idx.WooCommerceAgent);
  });

  it('business index exports all 6 agents', () => {
    const idx = require('../../microbots/business/index.js');
    assert.ok(idx.SalesMonitorAgent);
    assert.ok(idx.InventoryWatcherAgent);
    assert.ok(idx.CustomerAnalyzerAgent);
    assert.ok(idx.FraudSentinelAgent);
    assert.ok(idx.RevenueReporterAgent);
    assert.ok(idx.PricingOptimizerAgent);
  });

  it('operations index exports all 4 agents', () => {
    const idx = require('../../microbots/operations/index.js');
    assert.ok(idx.HealthProbeAgent);
    assert.ok(idx.AlertDispatcherAgent);
    assert.ok(idx.PerformanceTrackerAgent);
    assert.ok(idx.ComplianceAuditorAgent);
  });

  it('root microbots index exports all agents flat', () => {
    const idx = require('../../microbots/index.js');
    assert.ok(idx.SquareAgent);
    assert.ok(idx.SalesMonitorAgent);
    assert.ok(idx.HealthProbeAgent);
  });
});
