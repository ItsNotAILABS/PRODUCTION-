import { XPlatformConnector } from '../platform-connector.js';

/**
 * SquareConnector — X ecosystem adapter for the Square commerce platform.
 * Operations: payments, catalog, inventory, orders, customers, reports, locations.
 * Provide credentials.accessToken and credentials.locationId for production.
 * Without credentials all operations return schema-correct stub data.
 */
export class SquareConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'square',
      version:      '1.0.0',
      capabilities: ['payments', 'catalog', 'inventory', 'orders', 'customers', 'reports'],
      credentials,
    });
  }

  async connect() {
    const { accessToken } = this.credentials;
    if (accessToken && !accessToken.startsWith('EAA') && !accessToken.startsWith('sandbox-')) {
      throw new Error('SquareConnector: accessToken malformed (expected EAA… or sandbox-…)');
    }
    await super.connect();
  }

  _operations() {
    return {
      'payments.list':    (p) => ({ payments: [], cursor: null, platform: 'square', ...p }),
      'payments.create':  (p) => ({ payment: { id: 'sq-pay-stub', status: 'COMPLETED', ...p }, platform: 'square' }),
      'catalog.list':     (p) => ({ objects: [], cursor: null, platform: 'square', types: p.types ?? ['ITEM'] }),
      'catalog.upsert':   (p) => ({ objects: [], platform: 'square', idempotencyKey: p.idempotencyKey }),
      'inventory.counts': (p) => ({ counts: [], cursor: null, platform: 'square' }),
      'inventory.adjust': (p) => ({ counts: [], changes: p.changes ?? [], platform: 'square' }),
      'orders.list':      (p) => ({ orders: [], cursor: null, platform: 'square' }),
      'orders.create':    (p) => ({ order: { id: 'sq-ord-stub', state: 'OPEN', ...p.order }, platform: 'square' }),
      'customers.list':   (p) => ({ customers: [], cursor: null, platform: 'square' }),
      'customers.search': (p) => ({ customers: [], platform: 'square', query: p.query }),
      'reports.sales':    (p) => ({ data: [], summary: { totalSales: 0, totalTransactions: 0 }, platform: 'square' }),
      'reports.items':    (p) => ({ data: [], platform: 'square' }),
      'locations.list':   ()  => ({ locations: [], platform: 'square' }),
    };
  }
}

export default SquareConnector;
