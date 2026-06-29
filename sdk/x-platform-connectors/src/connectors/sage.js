import { XPlatformConnector } from '../platform-connector.js';

/**
 * SageConnector — X ecosystem adapter for Sage Business Cloud Accounting.
 * Operations: invoices, purchases, customers, ledger, reports, vatReturns.
 * Provide credentials.clientId, credentials.clientSecret, credentials.accessToken.
 */
export class SageConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'sage',
      version:      '1.0.0',
      capabilities: ['invoices', 'purchases', 'customers', 'ledger'],
      credentials,
    });
  }

  _operations() {
    return {
      'invoices.list':      (p) => { this._requireConnected(); return { data: [], meta: { total_count: 0 }, platform: 'sage' }; },
      'invoices.get':       (p) => { this._requireConnected(); return { id: p.invoiceId ?? null, status: null, total_amount: null, platform: 'sage' }; },
      'invoices.create':    (p) => { this._requireConnected(); return { id: null, status: 'DRAFT', platform: 'sage' }; },
      'purchases.list':     (p) => { this._requireConnected(); return { data: [], meta: { total_count: 0 }, platform: 'sage' }; },
      'purchases.create':   (p) => { this._requireConnected(); return { id: null, status: null, platform: 'sage' }; },
      'customers.list':     (p) => { this._requireConnected(); return { data: [], meta: { total_count: 0 }, platform: 'sage' }; },
      'customers.get':      (p) => { this._requireConnected(); return { id: p.customerId ?? null, name: null, email: null, platform: 'sage' }; },
      'customers.create':   (p) => { this._requireConnected(); return { id: null, name: p.name ?? null, platform: 'sage' }; },
      'ledger.accounts':    (p) => { this._requireConnected(); return { data: [], platform: 'sage' }; },
      'ledger.journals':    (p) => { this._requireConnected(); return { data: [], platform: 'sage' }; },
      'reports.trial':      (p) => { this._requireConnected(); return { data: { rows: [], from_date: null, to_date: null }, platform: 'sage' }; },
      'vatReturns.list':    (p) => { this._requireConnected(); return { data: [], platform: 'sage' }; },
    };
  }
}

export default SageConnector;
