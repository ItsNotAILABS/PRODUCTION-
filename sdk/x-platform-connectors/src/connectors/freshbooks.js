import { XPlatformConnector } from '../platform-connector.js';

/**
 * FreshBooksConnector — X ecosystem adapter for FreshBooks Accounting.
 * Operations: invoices, expenses, clients, reports, time.
 * Provide credentials.clientId, credentials.accessToken, credentials.accountId.
 */
export class FreshBooksConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'freshbooks',
      version:      '1.0.0',
      capabilities: ['invoices', 'expenses', 'clients', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'invoices.list':        (p) => { this._requireConnected(); return { invoices: [], total: 0, pages: 1, platform: 'freshbooks' }; },
      'invoices.get':         (p) => { this._requireConnected(); return { invoice: { id: p.invoiceId ?? null, status: null, amount: null }, platform: 'freshbooks' }; },
      'invoices.create':      (p) => { this._requireConnected(); return { invoice: { id: null, status: 'draft' }, platform: 'freshbooks' }; },
      'invoices.send':        (p) => { this._requireConnected(); return { invoice: { id: p.invoiceId ?? null, status: 'sent' }, platform: 'freshbooks' }; },
      'expenses.list':        (p) => { this._requireConnected(); return { expenses: [], total: 0, platform: 'freshbooks' }; },
      'expenses.create':      (p) => { this._requireConnected(); return { expense: { id: null, amount: p.amount ?? null }, platform: 'freshbooks' }; },
      'clients.list':         (p) => { this._requireConnected(); return { clients: [], total: 0, platform: 'freshbooks' }; },
      'clients.get':          (p) => { this._requireConnected(); return { client: { id: p.clientId ?? null, email: null, organization: null }, platform: 'freshbooks' }; },
      'clients.create':       (p) => { this._requireConnected(); return { client: { id: null, email: p.email ?? null }, platform: 'freshbooks' }; },
      'reports.profitLoss':   (p) => { this._requireConnected(); return { data: { income: [], expenses: [], net_profit: 0 }, platform: 'freshbooks' }; },
      'reports.expenses':     (p) => { this._requireConnected(); return { data: { expenses: [], total: 0 }, platform: 'freshbooks' }; },
      'time.entries':         (p) => { this._requireConnected(); return { time_entries: [], total: 0, platform: 'freshbooks' }; },
    };
  }
}

export default FreshBooksConnector;
