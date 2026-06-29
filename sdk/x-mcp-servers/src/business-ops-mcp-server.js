/**
 * Business Operations MCP Server
 * Exposes all 10 business sub-protocols as Model Context Protocol tools.
 * Start via stdio:  node sdk/x-mcp-servers/src/business-ops-mcp-server.js --stdio
 * Start via HTTP:   node sdk/x-mcp-servers/src/business-ops-mcp-server.js --http [port]
 */

import { MCPTransport }                   from './mcp-transport.js';
import { SalesIntelligenceProtocol }      from '../../../protocols/business/sales-intelligence-protocol.js';
import { InventoryOptimizationProtocol }  from '../../../protocols/business/inventory-optimization-protocol.js';
import { CustomerSegmentationProtocol }   from '../../../protocols/business/customer-segmentation-protocol.js';
import { FraudDetectionProtocol }         from '../../../protocols/business/fraud-detection-protocol.js';
import { RevenueForecastProtocol }        from '../../../protocols/business/revenue-forecast-protocol.js';
import { CrossPlatformSyncProtocol }      from '../../../protocols/business/cross-platform-sync-protocol.js';
import { BusinessIntelligenceProtocol }   from '../../../protocols/business/business-intelligence-protocol.js';
import { PricingOptimizationProtocol }    from '../../../protocols/business/pricing-optimization-protocol.js';
import { SupplyChainProtocol }            from '../../../protocols/business/supply-chain-protocol.js';
import { CustomerRetentionProtocol }      from '../../../protocols/business/customer-retention-protocol.js';

export class BusinessOpsMCPServer {
  constructor(config = {}) {
    this.name    = 'x-business-ops';
    this.version = '1.0.0';
    this.sales      = new SalesIntelligenceProtocol(config.sales);
    this.inventory  = new InventoryOptimizationProtocol(config.inventory);
    this.segment    = new CustomerSegmentationProtocol(config.segmentation);
    this.fraud      = new FraudDetectionProtocol(config.fraud);
    this.revenue    = new RevenueForecastProtocol(config.revenue);
    this.sync       = new CrossPlatformSyncProtocol(config.sync);
    this.bi         = new BusinessIntelligenceProtocol(config.bi);
    this.pricing    = new PricingOptimizationProtocol(config.pricing);
    this.supplyChain = new SupplyChainProtocol(config.supplyChain);
    this.retention  = new CustomerRetentionProtocol(config.retention);
    this.metrics    = { calls: 0, errors: 0 };
  }

  listTools() {
    return [
      {
        name: 'sales_analyze',
        description: 'Analyze a batch of sales transactions for patterns, velocity, and forecast.',
        inputSchema: { type: 'object', properties: { transactions: { type: 'array', items: { type: 'object' }, description: 'Array of {platform, amount, timestamp, productId?}' } }, required: ['transactions'] },
      },
      {
        name: 'sales_score_velocity',
        description: 'Score revenue velocity for a platform versus historical baseline.',
        inputSchema: { type: 'object', properties: { platform: { type: 'string' }, currentRevenue: { type: 'number' } }, required: ['platform', 'currentRevenue'] },
      },
      {
        name: 'inventory_optimize',
        description: 'Compute reorder recommendations for an inventory item list.',
        inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' }, description: 'Array of inventory items with sku, currentStock, avgDailySales, leadTimeDays, reorderCost, holdingCostPerUnit' } }, required: ['items'] },
      },
      {
        name: 'inventory_reorder_point',
        description: 'Calculate the reorder point for a single SKU.',
        inputSchema: { type: 'object', properties: { avgDailySales: { type: 'number' }, leadTimeDays: { type: 'number' }, safetyStock: { type: 'number' } }, required: ['avgDailySales', 'leadTimeDays'] },
      },
      {
        name: 'customer_segment',
        description: 'Segment a customer using RFM analysis into Platinum/Gold/Silver/Bronze/At-Risk/Lost.',
        inputSchema: { type: 'object', properties: { customerId: { type: 'string' }, daysSinceLastOrder: { type: 'number' }, totalOrders: { type: 'number' }, totalRevenue: { type: 'number' } }, required: ['customerId', 'daysSinceLastOrder', 'totalOrders', 'totalRevenue'] },
      },
      {
        name: 'fraud_score',
        description: 'Score a transaction for fraud risk using multi-signal analysis.',
        inputSchema: { type: 'object', properties: { transactionId: { type: 'string' }, amount: { type: 'number' }, ipAddress: { type: 'string' }, customerId: { type: 'string' }, platform: { type: 'string' }, country: { type: 'string' } }, required: ['transactionId', 'amount'] },
      },
      {
        name: 'fraud_velocity_check',
        description: 'Check transaction velocity for an identity to detect burst patterns.',
        inputSchema: { type: 'object', properties: { identity: { type: 'string' }, transactions: { type: 'array', items: { type: 'object' } }, windowMs: { type: 'number' } }, required: ['identity', 'transactions'] },
      },
      {
        name: 'revenue_forecast',
        description: 'Forecast revenue over a horizon using phi-weighted EMA.',
        inputSchema: { type: 'object', properties: { historicalData: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, revenue: { type: 'number' } } } }, horizonDays: { type: 'number' } }, required: ['historicalData', 'horizonDays'] },
      },
      {
        name: 'pricing_optimize',
        description: 'Compute optimal price for a product given market signals.',
        inputSchema: { type: 'object', properties: { productId: { type: 'string' }, currentPrice: { type: 'number' }, costPrice: { type: 'number' }, competitorPrice: { type: 'number' }, demandScore: { type: 'number' } }, required: ['productId', 'currentPrice', 'costPrice'] },
      },
      {
        name: 'supply_chain_rank_suppliers',
        description: 'Rank registered suppliers for a fulfillment requirement.',
        inputSchema: { type: 'object', properties: { requiredLeadTimeDays: { type: 'number' }, quantity: { type: 'number' }, maxCost: { type: 'number' } }, required: ['requiredLeadTimeDays', 'quantity'] },
      },
      {
        name: 'supply_chain_route_fulfillment',
        description: 'Compute optimal warehouse routing for an order.',
        inputSchema: { type: 'object', properties: { warehouses: { type: 'array', items: { type: 'object' } }, order: { type: 'object', properties: { quantity: { type: 'number' }, maxDeliveryDays: { type: 'number' } } } }, required: ['warehouses', 'order'] },
      },
      {
        name: 'retention_predict_churn',
        description: 'Predict churn probability and intervention score for a customer.',
        inputSchema: { type: 'object', properties: { customerId: { type: 'string' }, daysSinceLastOrder: { type: 'number' }, orderFrequency: { type: 'number' }, avgOrderValue: { type: 'number' }, supportTickets: { type: 'number' }, returnRate: { type: 'number' } }, required: ['customerId', 'daysSinceLastOrder', 'orderFrequency', 'avgOrderValue'] },
      },
      {
        name: 'retention_calculate_ltv',
        description: 'Calculate Customer Lifetime Value with phi-discounting.',
        inputSchema: { type: 'object', properties: { avgOrderValue: { type: 'number' }, purchaseFrequencyPerYear: { type: 'number' }, avgCustomerLifetimeYears: { type: 'number' } }, required: ['avgOrderValue', 'purchaseFrequencyPerYear'] },
      },
      {
        name: 'retention_recommend_interventions',
        description: 'Recommend retention actions for a customer churn profile.',
        inputSchema: { type: 'object', properties: { churnRisk: { type: 'string', enum: ['low', 'medium', 'high', 'churned'] }, ltv: { type: 'number' }, churnProbability: { type: 'number' } }, required: ['churnRisk', 'ltv', 'churnProbability'] },
      },
      {
        name: 'bi_digest',
        description: 'Generate a unified business intelligence digest across all platforms.',
        inputSchema: { type: 'object', properties: { data: { type: 'object', description: 'Multi-platform data object { platforms, transactions, customers }' } }, required: ['data'] },
      },
    ];
  }

  async callTool(name, args) {
    this.metrics.calls++;
    try {
      const result = await this.#route(name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      this.metrics.errors++;
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }

  async #route(name, args) {
    switch (name) {
      case 'sales_analyze':           return this.sales.analyze(args.transactions);
      case 'sales_score_velocity':    return this.sales.scoreVelocity(args.platform, args.currentRevenue);
      case 'inventory_optimize':      return this.inventory.optimize(args.items);
      case 'inventory_reorder_point': return { reorderPoint: this.inventory.reorderPoint(args) };
      case 'customer_segment':        return this.segment.segment(args);
      case 'fraud_score':             return this.fraud.score(args);
      case 'fraud_velocity_check':    return this.fraud.velocityCheck(args.identity, args.transactions, args.windowMs);
      case 'revenue_forecast':        return this.revenue.forecast(args.historicalData, args.horizonDays);
      case 'pricing_optimize':        return this.pricing.optimize(args, { competitorPrice: args.competitorPrice, demandScore: args.demandScore });
      case 'supply_chain_rank_suppliers':   return this.supplyChain.rankSuppliers(args);
      case 'supply_chain_route_fulfillment': return this.supplyChain.routeFulfillment(args.warehouses, args.order);
      case 'retention_predict_churn':       return this.retention.predictChurn(args);
      case 'retention_calculate_ltv':       return this.retention.calculateLTV(args);
      case 'retention_recommend_interventions': return this.retention.recommendInterventions(args);
      case 'bi_digest':               return this.bi.digest(args.data);
      default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
    }
  }

  report() {
    return { server: this.name, version: this.version, tools: this.listTools().length, metrics: this.metrics };
  }

  start({ stdio = false, http = false, port = 3100 } = {}) {
    const transport = new MCPTransport(this);
    if (stdio) transport.startStdio();
    if (http)  return transport.startHttp(port);
    return transport;
  }
}

// Direct invocation
if (process.argv[1] && process.argv[1].endsWith('business-ops-mcp-server.js')) {
  const server  = new BusinessOpsMCPServer();
  const useHttp = process.argv.includes('--http');
  const port    = parseInt(process.argv[process.argv.indexOf('--http') + 1] || '3100', 10);
  server.start({ stdio: !useHttp, http: useHttp, port });
}

export default BusinessOpsMCPServer;
