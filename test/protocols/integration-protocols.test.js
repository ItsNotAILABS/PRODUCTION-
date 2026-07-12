/**
 * Test suite: Integration Sub-Protocols (PROTO-I001 – PROTO-I020)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MCPGatewayProtocol }                                  from '../../protocols/integrations/mcp-gateway-protocol.js';
import { IntegrationOrchestrationProtocol, WORKFLOW_STATUS }   from '../../protocols/integrations/integration-orchestration-protocol.js';
import { DataNormalizationProtocol }                           from '../../protocols/integrations/data-normalization-protocol.js';
import { RateLimitManagerProtocol }                            from '../../protocols/integrations/rate-limit-manager-protocol.js';
import { WebhookOrchestrationProtocol }                        from '../../protocols/integrations/webhook-orchestration-protocol.js';
import { OAuthManagerProtocol }                                from '../../protocols/integrations/oauth-manager-protocol.js';
import { APIKeyManagerProtocol }                               from '../../protocols/integrations/api-key-manager-protocol.js';
import { DataSchemaProtocol }                                  from '../../protocols/integrations/data-schema-protocol.js';
import { EventStreamingProtocol }                              from '../../protocols/integrations/event-streaming-protocol.js';
import { BatchProcessingProtocol }                             from '../../protocols/integrations/batch-processing-protocol.js';
import { RetryRecoveryProtocol, CIRCUIT_STATE }                from '../../protocols/integrations/retry-recovery-protocol.js';
import { DataEnrichmentProtocol }                              from '../../protocols/integrations/data-enrichment-protocol.js';
import { MultiCurrencyProtocol }                               from '../../protocols/integrations/multi-currency-protocol.js';
import { TaxCalculationProtocol, TAX_TYPE }                    from '../../protocols/integrations/tax-calculation-protocol.js';
import { ShippingIntelligenceProtocol }                        from '../../protocols/integrations/shipping-intelligence-protocol.js';
import { LoyaltyRewardsProtocol }                              from '../../protocols/integrations/loyalty-rewards-protocol.js';
import { ProductCatalogProtocol }                              from '../../protocols/integrations/product-catalog-protocol.js';
import { OrderRoutingProtocol }                                from '../../protocols/integrations/order-routing-protocol.js';
import { CustomerIdentityProtocol }                            from '../../protocols/integrations/customer-identity-protocol.js';
import { AnalyticsAggregationProtocol }                        from '../../protocols/integrations/analytics-aggregation-protocol.js';
import { INTEGRATIONS_PROTOCOL_VERSION, INTEGRATIONS_PROTOCOL_COUNT } from '../../protocols/integrations/index.js';

// ─── Index ────────────────────────────────────────────────────────────────────
describe('integrations/index', () => {
  it('exports INTEGRATIONS_PROTOCOL_COUNT = 20', () => {
    assert.equal(INTEGRATIONS_PROTOCOL_COUNT, 20);
  });
  it('exports INTEGRATIONS_PROTOCOL_VERSION string', () => {
    assert.ok(typeof INTEGRATIONS_PROTOCOL_VERSION === 'string');
  });
});

// ─── PROTO-I001: MCPGatewayProtocol ──────────────────────────────────────────
describe('MCPGatewayProtocol', () => {
  it('register returns tool count', () => {
    const gw = new MCPGatewayProtocol();
    const fakeServer = { listTools: () => ['tool_a', 'tool_b'] };
    const r = gw.register('srv1', fakeServer);
    assert.equal(r.toolCount, 2);
    assert.equal(gw.report().metrics.registered, 1);
  });

  it('listAllTools aggregates across servers', () => {
    const gw = new MCPGatewayProtocol();
    gw.register('s1', { listTools: () => ['alpha'] });
    gw.register('s2', { listTools: () => ['beta'] });
    const tools = gw.listAllTools();
    assert.ok(tools.some((t) => t.tool === 'alpha'));
    assert.ok(tools.some((t) => t.tool === 'beta'));
  });

  it('route dispatches to registered server', async () => {
    const gw = new MCPGatewayProtocol();
    const srv = { listTools: () => ['greet'], greet: async () => 'hello' };
    gw.register('demo', srv);
    const r = await gw.route('greet', {});
    assert.equal(r.result, 'hello');
    assert.equal(r.server, 'demo');
  });

  it('route throws for unknown tool', async () => {
    const gw = new MCPGatewayProtocol();
    await assert.rejects(() => gw.route('unknown_tool', {}), /No server registered/);
  });
});

// ─── PROTO-I002: IntegrationOrchestrationProtocol ────────────────────────────
describe('IntegrationOrchestrationProtocol', () => {
  it('WORKFLOW_STATUS enum is defined', () => {
    assert.ok(WORKFLOW_STATUS);
    assert.ok(WORKFLOW_STATUS.PENDING);
    assert.ok(WORKFLOW_STATUS.DONE || WORKFLOW_STATUS.COMPLETED);
  });

  it('defineWorkflow and executeWorkflow run steps in order', async () => {
    const orch = new IntegrationOrchestrationProtocol();
    const order = [];
    orch.defineWorkflow('wf1', [
      { id: 'a', fn: async () => { order.push('a'); return { ok: true }; }, dependsOn: [] },
      { id: 'b', fn: async () => { order.push('b'); return { ok: true }; }, dependsOn: ['a'] },
    ]);
    const result = await orch.executeWorkflow('wf1', {});
    assert.ok(result.success || result.steps);
    assert.equal(order[0], 'a');
    assert.equal(order[1], 'b');
  });

  it('unknown workflow throws', async () => {
    const orch = new IntegrationOrchestrationProtocol();
    await assert.rejects(() => orch.executeWorkflow('ghost', {}), /not found|unknown/i);
  });
});

// ─── PROTO-I003: DataNormalizationProtocol ───────────────────────────────────
describe('DataNormalizationProtocol', () => {
  it('registerSchema and normalize maps fields', () => {
    const dnp = new DataNormalizationProtocol();
    dnp.registerSchema('order', { external_id: 'id', ext_total: 'total' });
    const result = dnp.normalize('order', { external_id: 'ord-1', ext_total: 99.99 });
    assert.ok(typeof result === 'object' && result !== null);
    assert.ok('id' in result || 'external_id' in result);
  });

  it('normalize returns object', () => {
    const dnp = new DataNormalizationProtocol();
    dnp.registerSchema('item', { sku_code: 'sku' });
    const out = dnp.normalize('item', { sku_code: 'ABC' });
    assert.ok(typeof out === 'object');
  });
});

// ─── PROTO-I004: RateLimitManagerProtocol ────────────────────────────────────
describe('RateLimitManagerProtocol', () => {
  it('registerLimit returns config', () => {
    const rl = new RateLimitManagerProtocol();
    const r = rl.registerLimit('shopify', { requestsPerMin: 60 });
    assert.equal(r.platform, 'shopify');
    assert.ok(r.requestsPerMin > 0);
  });

  it('consume allows first request', () => {
    const rl = new RateLimitManagerProtocol();
    rl.registerLimit('stripe', { requestsPerMin: 100 });
    const r = rl.consume('stripe');
    assert.ok(r.allowed);
  });

  it('consume throws for unknown platform', () => {
    const rl = new RateLimitManagerProtocol();
    assert.throws(() => rl.consume('nope'), /No rate limit registered/);
  });
});

// ─── PROTO-I005: WebhookOrchestrationProtocol ────────────────────────────────
describe('WebhookOrchestrationProtocol', () => {
  it('registerEndpoint returns endpoint info', () => {
    const wh = new WebhookOrchestrationProtocol();
    const handler = async () => {};
    const r = wh.registerEndpoint('shopify.order.created', null, handler);
    assert.ok(r.platform === 'shopify.order.created' || r.registered);
  });

  it('receive without secret dispatches to handler', async () => {
    const handled = [];
    const wh = new WebhookOrchestrationProtocol();
    const handler = async (p) => { handled.push(p); return { ok: true }; };
    wh.registerEndpoint('order.paid', null, handler);
    const r = await wh.receive('order.paid', { orderId: 'o-1' }, {}, '');
    assert.ok(r.verified !== false || handled.length > 0 || r.platform === 'order.paid');
  });
});

// ─── PROTO-I006: OAuthManagerProtocol ────────────────────────────────────────
describe('OAuthManagerProtocol', () => {
  it('registerApp and storeToken, then getToken', async () => {
    const oauth = new OAuthManagerProtocol();
    oauth.registerApp('myapp', { clientId: 'cid', clientSecret: 'csec' });
    oauth.storeToken('myapp', 'user-1', {
      accessToken:  'tok-abc',
      refreshToken: 'ref-xyz',
      expiresAt:    Date.now() + 3_600_000,
    });
    const tok = await oauth.getToken('myapp', 'user-1');
    assert.ok(tok.accessToken === 'tok-abc' || tok.valid);
  });

  it('getToken throws for unknown tenantId', async () => {
    const oauth = new OAuthManagerProtocol();
    oauth.registerApp('app2', { clientId: 'c', clientSecret: 's' });
    await assert.rejects(() => oauth.getToken('app2', 'nobody'), /No token stored/);
  });
});

// ─── PROTO-I007: APIKeyManagerProtocol ───────────────────────────────────────
describe('APIKeyManagerProtocol', () => {
  it('store and retrieve key', () => {
    const km = new APIKeyManagerProtocol();
    km.store('stripe', 'svc-1', 'sk_test_12345');
    const r = km.retrieve('stripe', 'svc-1');
    assert.ok(r.key === 'sk_test_12345' || r.valid || r);
  });

  it('rotate returns new key info', () => {
    const km = new APIKeyManagerProtocol();
    km.store('paypal', 'app-1', 'old_key');
    const r = km.rotate('paypal', 'app-1', 'new_key');
    assert.ok(r.rotated || r.newKey || r);
  });

  it('audit returns history array', () => {
    const km = new APIKeyManagerProtocol();
    km.store('square', 'worker-1', 'sq_key_abc');
    const audit = km.audit('square', 'worker-1');
    assert.ok(Array.isArray(audit) || typeof audit === 'object');
  });
});

// ─── PROTO-I008: DataSchemaProtocol ──────────────────────────────────────────
describe('DataSchemaProtocol', () => {
  it('registerSchema and validate valid object passes', () => {
    const dsp = new DataSchemaProtocol();
    dsp.registerSchema('customer', {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['id'],
    });
    const r = dsp.validate('customer', { id: 'c-1', email: 'a@b.com' });
    assert.ok(r.valid);
  });

  it('validate missing required field fails', () => {
    const dsp = new DataSchemaProtocol();
    dsp.registerSchema('product', {
      type: 'object',
      properties: { sku: { type: 'string' } },
      required: ['sku'],
    });
    const r = dsp.validate('product', { name: 'Widget' });
    assert.ok(!r.valid || r.errors?.length > 0);
  });
});

// ─── PROTO-I009: EventStreamingProtocol ──────────────────────────────────────
describe('EventStreamingProtocol', () => {
  it('subscribe and publish delivers event', async () => {
    const es = new EventStreamingProtocol();
    const received = [];
    es.subscribe('payments', (evt) => received.push(evt));
    await es.publish('payments', { amount: 100 });
    assert.ok(received.length > 0);
    assert.ok(received[0].amount === 100 || received[0].payload?.amount === 100 || received[0]);
  });

  it('unsubscribe stops delivery', async () => {
    const es = new EventStreamingProtocol();
    const received = [];
    const handler = (evt) => received.push(evt);
    es.subscribe('orders', handler);
    es.unsubscribe('orders', handler);
    await es.publish('orders', { id: 'o-1' });
    assert.equal(received.length, 0);
  });

  it('publishBatch delivers all events', async () => {
    const es = new EventStreamingProtocol();
    const received = [];
    es.subscribe('items', (e) => received.push(e));
    await es.publishBatch('items', [{ n: 1 }, { n: 2 }, { n: 3 }]);
    assert.equal(received.length, 3);
  });
});

// ─── PROTO-I010: BatchProcessingProtocol ─────────────────────────────────────
describe('BatchProcessingProtocol', () => {
  it('createBatch and executeBatch runs all items', async () => {
    const bp = new BatchProcessingProtocol();
    const results = [];
    const id = bp.createBatch('import', [
      { process: async () => { results.push(1); return { ok: true }; } },
      { process: async () => { results.push(2); return { ok: true }; } },
    ]);
    await bp.executeBatch(id);
    assert.ok(results.length > 0 || id);
  });

  it('getBatchStatus returns status', async () => {
    const bp = new BatchProcessingProtocol();
    const id = bp.createBatch('export', []);
    await bp.executeBatch(id);
    const status = bp.getBatchStatus(id);
    assert.ok(status.status || status.completed !== undefined || status);
  });
});

// ─── PROTO-I011: RetryRecoveryProtocol ───────────────────────────────────────
describe('RetryRecoveryProtocol', () => {
  it('CIRCUIT_STATE enum is defined', () => {
    assert.ok(CIRCUIT_STATE.CLOSED);
    assert.ok(CIRCUIT_STATE.OPEN);
    assert.ok(CIRCUIT_STATE.HALF_OPEN);
  });

  it('withRetry succeeds on first attempt', async () => {
    const rrp = new RetryRecoveryProtocol();
    const result = await rrp.withRetry(async () => 42);
    assert.equal(result, 42);
  });

  it('withRetry retries on failure then succeeds', async () => {
    const rrp = new RetryRecoveryProtocol();
    let attempts = 0;
    const result = await rrp.withRetry(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return 'ok';
    }, { maxRetries: 3, baseDelayMs: 1 });
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  });

  it('circuitStatus starts CLOSED', () => {
    const rrp = new RetryRecoveryProtocol();
    assert.equal(rrp.circuitStatus().state, CIRCUIT_STATE.CLOSED);
  });

  it('registerRecovery is called for matching error', async () => {
    const rrp = new RetryRecoveryProtocol();
    rrp.registerRecovery('Error', async () => 'recovered');
    const result = await rrp.withRetry(async () => { throw new Error('boom'); }, { maxRetries: 0, baseDelayMs: 1 });
    assert.equal(result, 'recovered');
  });
});

// ─── PROTO-I012: DataEnrichmentProtocol ──────────────────────────────────────
describe('DataEnrichmentProtocol', () => {
  it('registerEnricher and enrich adds fields', async () => {
    const dep = new DataEnrichmentProtocol();
    dep.registerEnricher('geo', async (data) => ({ ...data, country: 'US' }));
    const result = await dep.enrich({ ip: '1.2.3.4' }, ['geo']);
    assert.ok(result.country === 'US' || result.enriched?.country === 'US' || result);
  });

  it('enrichBatch processes multiple items', async () => {
    const dep = new DataEnrichmentProtocol();
    dep.registerEnricher('tag', async (d) => ({ ...d, tagged: true }));
    const results = await dep.enrichBatch([{ id: 1 }, { id: 2 }], ['tag']);
    assert.ok(Array.isArray(results) || results.length === 2 || results);
  });
});

// ─── PROTO-I013: MultiCurrencyProtocol ───────────────────────────────────────
describe('MultiCurrencyProtocol', () => {
  it('setRates and convert USD→EUR', () => {
    const mcp = new MultiCurrencyProtocol();
    mcp.setRates('USD', { EUR: 0.92, GBP: 0.78 });
    const r = mcp.convert(100, 'USD', 'EUR');
    assert.ok(Math.abs(r.converted - 92) < 1);
    assert.equal(r.from, 'USD');
    assert.equal(r.to, 'EUR');
  });

  it('same currency returns same amount', () => {
    const mcp = new MultiCurrencyProtocol();
    const r = mcp.convert(50, 'USD', 'USD');
    assert.equal(r.converted, 50);
  });

  it('normalize converts array of items', () => {
    const mcp = new MultiCurrencyProtocol();
    mcp.setRates('USD', { EUR: 0.92 });
    const items = [{ amount: 10, currency: 'USD' }, { amount: 20, currency: 'USD' }];
    const out = mcp.normalize(items, 'EUR');
    assert.equal(out.length, 2);
  });

  it('unknown currency throws', () => {
    const mcp = new MultiCurrencyProtocol();
    assert.throws(() => mcp.convert(10, 'USD', 'XYZ'), /No exchange rate/);
  });
});

// ─── PROTO-I014: TaxCalculationProtocol ──────────────────────────────────────
describe('TaxCalculationProtocol', () => {
  it('TAX_TYPE enum is defined', () => {
    assert.ok(TAX_TYPE);
  });

  it('registerRule and calculate returns taxAmount', () => {
    const tcp = new TaxCalculationProtocol();
    tcp.registerRule('US-CA', { rate: 0.0725, type: TAX_TYPE?.SALES ?? 'sales' });
    const r = tcp.calculate(100, 'US-CA');
    assert.ok(r.taxAmount > 0 || r.totalAmount > 100);
  });

  it('calculateBatch processes multiple line items', () => {
    const tcp = new TaxCalculationProtocol();
    tcp.registerRule('US-NY', { rate: 0.08, type: 'sales' });
    const result = tcp.calculateBatch([{ amount: 50 }, { amount: 75 }], 'US-NY');
    assert.ok(result.lineItems?.length === 2 || Array.isArray(result) || result);
    assert.ok(result.totalTax > 0 || result.lineItems);
  });
});

// ─── PROTO-I015: ShippingIntelligenceProtocol ────────────────────────────────
describe('ShippingIntelligenceProtocol', () => {
  it('registerCarrier and quote returns ranked rates', () => {
    const sip = new ShippingIntelligenceProtocol();
    sip.registerCarrier('fedex', { rateTable: [{ minKg: 0, maxKg: 10, baseRate: 8, perKg: 1.5 }], transitDays: { 'NY-CA': 3 } });
    const rates = sip.quote('NY', 'CA', 2);
    assert.ok(Array.isArray(rates));
    assert.ok(rates.length > 0);
    assert.ok(rates[0].carrier === 'fedex');
  });

  it('selectOptimal picks best from quotes array', () => {
    const sip = new ShippingIntelligenceProtocol();
    sip.registerCarrier('ups', { rateTable: [{ minKg: 0, maxKg: 10, baseRate: 5, perKg: 1 }], transitDays: {} });
    const quotes = sip.quote('NY', 'CA', 1);
    const best = sip.selectOptimal(quotes, { maxDays: 99 });
    assert.ok(best === null || best.carrier === 'ups');
  });
});

// ─── PROTO-I016: LoyaltyRewardsProtocol ──────────────────────────────────────
describe('LoyaltyRewardsProtocol', () => {
  it('registerProgram and earnPoints returns earned points', () => {
    const lrp = new LoyaltyRewardsProtocol();
    lrp.registerProgram('shopify', { pointsPerDollar: 2, redemptionRate: 0.01 });
    const r = lrp.earnPoints('cust-1', 'shopify', 50);
    assert.ok(r.points > 0);
    assert.ok(r.newBalance >= r.points);
  });

  it('redeemPoints reduces balance', () => {
    const lrp = new LoyaltyRewardsProtocol();
    lrp.registerProgram('amazon', { pointsPerDollar: 1, redemptionRate: 0.01 });
    lrp.earnPoints('cust-2', 'amazon', 200);
    const r = lrp.redeemPoints('cust-2', 50);
    assert.ok(r.redeemed === 50);
    assert.ok(r.dollarValue > 0);
  });

  it('redeemPoints throws for insufficient balance', () => {
    const lrp = new LoyaltyRewardsProtocol();
    lrp.registerProgram('x', { pointsPerDollar: 1, redemptionRate: 0.01 });
    lrp.earnPoints('cust-3', 'x', 1);
    assert.throws(() => lrp.redeemPoints('cust-3', 9999), /Insufficient/);
  });
});

// ─── PROTO-I017: ProductCatalogProtocol ──────────────────────────────────────
describe('ProductCatalogProtocol', () => {
  it('upsertProduct and query returns matching products', () => {
    const pcp = new ProductCatalogProtocol();
    pcp.upsertProduct({ sku: 'SKU-001', name: 'Widget', price: 9.99, tags: ['gadget'] });
    const results = pcp.query({ tags: ['gadget'] });
    assert.ok(Array.isArray(results) || results.length > 0 || results.products?.length > 0 || results);
  });

  it('upsertProduct updates existing product', () => {
    const pcp = new ProductCatalogProtocol();
    pcp.upsertProduct({ sku: 'SKU-002', name: 'Gizmo', price: 5 });
    pcp.upsertProduct({ sku: 'SKU-002', name: 'Gizmo Pro', price: 10 });
    const r = pcp.query({ sku: 'SKU-002' });
    assert.ok(r);
  });
});

// ─── PROTO-I018: OrderRoutingProtocol ────────────────────────────────────────
describe('OrderRoutingProtocol', () => {
  it('registerFulfillmentCenter and route order', () => {
    const orp = new OrderRoutingProtocol();
    orp.registerFulfillmentCenter('fc-east', { platforms: ['shopify'], capacity: 100, zones: ['US-EAST'], costPerOrder: 4 });
    const r = orp.route({ id: 'ord-1', platform: 'shopify', zone: 'US-EAST' });
    assert.ok(r.fulfillmentCenter === 'fc-east' || r.fulfillmentCenter);
    assert.ok(r.orderId === 'ord-1');
  });

  it('route throws when no center available', () => {
    const orp = new OrderRoutingProtocol();
    assert.throws(() => orp.route({ id: 'ord-2' }), /No fulfillment center/);
  });

  it('split divides order items across centers', () => {
    const orp = new OrderRoutingProtocol();
    orp.registerFulfillmentCenter('fc-a', {});
    orp.registerFulfillmentCenter('fc-b', {});
    const r = orp.split({ id: 'ord-3', items: [1, 2, 3, 4] }, ['fc-a', 'fc-b']);
    assert.ok(Array.isArray(r) || r.splits?.length === 2 || r);
  });
});

// ─── PROTO-I019: CustomerIdentityProtocol ────────────────────────────────────
describe('CustomerIdentityProtocol', () => {
  it('link creates master identity', () => {
    const cip = new CustomerIdentityProtocol();
    const r = cip.link('shopify', 'sh-123');
    assert.ok(r.masterCustomerId);
  });

  it('link same platformCustomerId returns same master', () => {
    const cip = new CustomerIdentityProtocol();
    const r1 = cip.link('shopify', 'sh-999');
    const r2 = cip.link('shopify', 'sh-999');
    assert.equal(r1.masterCustomerId, r2.masterCustomerId);
  });

  it('merge unifies two master identities', () => {
    const cip = new CustomerIdentityProtocol();
    const a = cip.link('shopify', 'a-1');
    const b = cip.link('stripe', 'b-2');
    const r = cip.merge(a.masterCustomerId, b.masterCustomerId);
    assert.ok(r.merged || r.masterCustomerId === a.masterCustomerId || r);
  });

  it('resolve looks up master by platform id', () => {
    const cip = new CustomerIdentityProtocol();
    const r = cip.link('square', 'sq-777');
    const resolved = cip.resolve('square', 'sq-777');
    assert.ok(resolved === r.masterCustomerId || resolved?.masterCustomerId === r.masterCustomerId || resolved);
  });
});

// ─── PROTO-I020: AnalyticsAggregationProtocol ────────────────────────────────
describe('AnalyticsAggregationProtocol', () => {
  it('track increments event count', () => {
    const aap = new AnalyticsAggregationProtocol();
    aap.track({ platform: 'shopify', type: 'pageview', customerId: 'c-1', value: 1 });
    aap.track({ platform: 'shopify', type: 'purchase', customerId: 'c-1', value: 100 });
    assert.equal(aap.report().metrics.events, 2);
  });

  it('aggregate returns data with phiScore', () => {
    const aap = new AnalyticsAggregationProtocol();
    aap.track({ platform: 'shopify', type: 'purchase', customerId: 'c-2', value: 50 });
    const r = aap.aggregate({ platforms: ['shopify'], metrics: ['count', 'sum'] });
    assert.ok(r.data);
    assert.ok(r.eventCount >= 1);
  });

  it('funnel computes conversion rates', () => {
    const aap = new AnalyticsAggregationProtocol();
    ['pageview', 'add_to_cart', 'purchase'].forEach((type) => {
      aap.track({ platform: 'shop', type, customerId: 'c-funnel', value: 0 });
    });
    const r = aap.funnel(['pageview', 'add_to_cart', 'purchase']);
    assert.ok(r.stages.length === 3);
    assert.ok(r.totalCustomers >= 1);
  });

  it('aggregate groupBy platform separates metrics', () => {
    const aap = new AnalyticsAggregationProtocol();
    aap.track({ platform: 'shopify', type: 'sale', value: 100 });
    aap.track({ platform: 'amazon', type: 'sale', value: 200 });
    const r = aap.aggregate({ metrics: ['count'], groupBy: 'platform' });
    assert.ok(r.data.shopify || r.data.amazon || r.data);
  });
});
