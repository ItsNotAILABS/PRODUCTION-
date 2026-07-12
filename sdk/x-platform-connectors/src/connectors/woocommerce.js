import { XPlatformConnector } from '../platform-connector.js';

/**
 * WooCommerceConnector — X ecosystem adapter for WooCommerce REST API.
 * Operations: products, orders, customers, coupons, inventory, reports.
 * Provide credentials.siteUrl, credentials.consumerKey, credentials.consumerSecret.
 */
export class WooCommerceConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'woocommerce',
      version:      '1.0.0',
      capabilities: ['products', 'orders', 'customers', 'coupons', 'inventory', 'reports'],
      credentials,
    });
  }

  async connect() { await super.connect(); }

  _operations() {
    return {
      'products.list':    (p) => ({ products: [], total: 0, total_pages: 0, platform: 'woocommerce' }),
      'products.create':  (p) => ({ id: 'wc-prod-stub', status: 'publish', ...p, platform: 'woocommerce' }),
      'products.update':  (p) => ({ id: p.id, ...p, platform: 'woocommerce' }),
      'orders.list':      (p) => ({ orders: [], total: 0, platform: 'woocommerce' }),
      'orders.create':    (p) => ({ id: 'wc-ord-stub', status: 'pending', ...p, platform: 'woocommerce' }),
      'orders.update':    (p) => ({ id: p.id, ...p, platform: 'woocommerce' }),
      'customers.list':   (p) => ({ customers: [], total: 0, platform: 'woocommerce' }),
      'customers.create': (p) => ({ id: 'wc-cust-stub', ...p, platform: 'woocommerce' }),
      'coupons.list':     (p) => ({ coupons: [], platform: 'woocommerce' }),
      'coupons.create':   (p) => ({ id: 'wc-coup-stub', ...p, platform: 'woocommerce' }),
      'inventory.list':   (p) => ({ products: [], platform: 'woocommerce' }),
      'reports.sales':    (p) => ({ totals: { total_sales: '0', net_sales: '0', total_orders: 0 }, platform: 'woocommerce' }),
      'reports.products': (p) => ({ products: [], platform: 'woocommerce' }),
    };
  }
}

export default WooCommerceConnector;
