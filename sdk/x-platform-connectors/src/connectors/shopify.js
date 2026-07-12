import { XPlatformConnector } from '../platform-connector.js';

/**
 * ShopifyConnector — X ecosystem adapter for Shopify.
 * Operations: products, orders, customers, inventory, analytics, fulfillment.
 * Provide credentials.shop (*.myshopify.com) and credentials.accessToken.
 */
export class ShopifyConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'shopify',
      version:      '1.0.0',
      capabilities: ['products', 'orders', 'customers', 'inventory', 'analytics', 'fulfillment'],
      credentials,
    });
  }

  async connect() {
    const { shop } = this.credentials;
    if (shop && !shop.includes('.')) {
      throw new Error('ShopifyConnector: shop domain invalid (expected *.myshopify.com)');
    }
    await super.connect();
  }

  _operations() {
    return {
      'products.list':       (p) => ({ products: [], page_info: null, platform: 'shopify' }),
      'products.get':        (p) => ({ product: { id: p.id, status: 'active' }, platform: 'shopify' }),
      'products.create':     (p) => ({ product: { id: 'sh-prod-stub', ...p }, platform: 'shopify' }),
      'products.update':     (p) => ({ product: { id: p.id, ...p }, platform: 'shopify' }),
      'orders.list':         (p) => ({ orders: [], platform: 'shopify', status: p.status ?? 'any' }),
      'orders.get':          (p) => ({ order: { id: p.id, financial_status: 'paid' }, platform: 'shopify' }),
      'orders.create':       (p) => ({ order: { id: 'sh-ord-stub', ...p }, platform: 'shopify' }),
      'customers.list':      (p) => ({ customers: [], platform: 'shopify' }),
      'customers.search':    (p) => ({ customers: [], platform: 'shopify', query: p.query }),
      'inventory.list':      (p) => ({ inventory_levels: [], platform: 'shopify' }),
      'inventory.adjust':    (p) => ({ inventory_level: { location_id: p.location_id }, platform: 'shopify' }),
      'analytics.sales':     (p) => ({ data: [], summary: { totalRevenue: 0, totalOrders: 0 }, platform: 'shopify' }),
      'analytics.customers': (p) => ({ data: [], platform: 'shopify' }),
      'fulfillment.list':    (p) => ({ fulfillments: [], platform: 'shopify' }),
      'fulfillment.create':  (p) => ({ fulfillment: { id: 'sh-ful-stub', order_id: p.order_id }, platform: 'shopify' }),
    };
  }
}

export default ShopifyConnector;
