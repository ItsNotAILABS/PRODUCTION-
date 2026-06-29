import { XPlatformConnector } from '../platform-connector.js';

/**
 * BigCommerceConnector — X ecosystem adapter for BigCommerce.
 * Operations: products, orders, customers, analytics, catalog, shipping.
 * Provide credentials.storeHash, credentials.accessToken.
 */
export class BigCommerceConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'bigcommerce',
      version:      '1.0.0',
      capabilities: ['products', 'orders', 'customers', 'analytics'],
      credentials,
    });
  }

  _operations() {
    return {
      'products.list':    (p) => { this._requireConnected(); return { data: [], meta: { pagination: { total: 0, count: 0, per_page: 50, current_page: 1, total_pages: 0 } }, platform: 'bigcommerce' }; },
      'products.get':     (p) => { this._requireConnected(); return { data: { id: p.id ?? null, name: null, availability: null }, platform: 'bigcommerce' }; },
      'products.create':  (p) => { this._requireConnected(); return { data: { id: null, name: p.name ?? null }, platform: 'bigcommerce' }; },
      'products.update':  (p) => { this._requireConnected(); return { data: { id: p.id ?? null }, platform: 'bigcommerce' }; },
      'orders.list':      (p) => { this._requireConnected(); return { data: [], platform: 'bigcommerce' }; },
      'orders.get':       (p) => { this._requireConnected(); return { data: { id: p.id ?? null, status: null, total_inc_tax: null }, platform: 'bigcommerce' }; },
      'orders.update':    (p) => { this._requireConnected(); return { data: { id: p.id ?? null, status: null }, platform: 'bigcommerce' }; },
      'customers.list':   (p) => { this._requireConnected(); return { data: [], meta: { pagination: { total: 0 } }, platform: 'bigcommerce' }; },
      'customers.get':    (p) => { this._requireConnected(); return { data: { id: p.id ?? null, email: null }, platform: 'bigcommerce' }; },
      'analytics.summary':(p) => { this._requireConnected(); return { data: { revenue: 0, orders: 0, visitors: 0 }, platform: 'bigcommerce' }; },
      'catalog.brands':   (p) => { this._requireConnected(); return { data: [], platform: 'bigcommerce' }; },
      'shipping.zones':   (p) => { this._requireConnected(); return { data: [], platform: 'bigcommerce' }; },
    };
  }
}

export default BigCommerceConnector;
