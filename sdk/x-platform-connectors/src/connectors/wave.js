import { XPlatformConnector } from '../platform-connector.js';

/**
 * WaveConnector — X ecosystem adapter for Wave Accounting.
 * Operations: invoices, accounting, customers, products, reports.
 * Provide credentials.accessToken, credentials.businessId.
 */
export class WaveConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'wave',
      version:      '1.0.0',
      capabilities: ['invoices', 'accounting', 'customers', 'products'],
      credentials,
    });
  }

  _operations() {
    return {
      'invoices.list':            (p) => { this._requireConnected(); return { data: { business: { invoices: { edges: [], pageInfo: null } } }, platform: 'wave' }; },
      'invoices.get':             (p) => { this._requireConnected(); return { data: { invoice: { id: p.invoiceId ?? null, status: null } }, platform: 'wave' }; },
      'invoices.create':          (p) => { this._requireConnected(); return { data: { invoiceCreate: { didSucceed: null, invoice: { id: null } } }, platform: 'wave' }; },
      'invoices.send':            (p) => { this._requireConnected(); return { data: { invoiceSend: { didSucceed: null } }, platform: 'wave' }; },
      'accounting.transactions':  (p) => { this._requireConnected(); return { data: { business: { transactions: { edges: [], pageInfo: null } } }, platform: 'wave' }; },
      'accounting.accounts':      (p) => { this._requireConnected(); return { data: { business: { accounts: [] } }, platform: 'wave' }; },
      'customers.list':           (p) => { this._requireConnected(); return { data: { business: { customers: { edges: [], pageInfo: null } } }, platform: 'wave' }; },
      'customers.get':            (p) => { this._requireConnected(); return { data: { customer: { id: p.customerId ?? null, name: null } }, platform: 'wave' }; },
      'customers.create':         (p) => { this._requireConnected(); return { data: { customerCreate: { didSucceed: null, customer: { id: null } } }, platform: 'wave' }; },
      'products.list':            (p) => { this._requireConnected(); return { data: { business: { products: { edges: [] } } }, platform: 'wave' }; },
      'products.create':          (p) => { this._requireConnected(); return { data: { productCreate: { didSucceed: null, product: { id: null } } }, platform: 'wave' }; },
      'reports.cashflow':         (p) => { this._requireConnected(); return { data: { business: { report: { totalInflow: 0, totalOutflow: 0, netCashflow: 0 } } }, platform: 'wave' }; },
    };
  }
}

export default WaveConnector;
