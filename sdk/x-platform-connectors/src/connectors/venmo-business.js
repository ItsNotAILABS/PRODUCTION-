import { XPlatformConnector } from '../platform-connector.js';

/**
 * VenmoBusinessConnector — X ecosystem adapter for Venmo Business.
 * Operations: payments, customers, reports, webhooks, disputes, balances, profiles.
 * Provide credentials.clientId, credentials.clientSecret, credentials.accessToken.
 */
export class VenmoBusinessConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'venmo-business',
      version:      '1.0.0',
      capabilities: ['payments', 'customers', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'payments.create':        (p) => { this._requireConnected(); return { id: null, status: null, amount: p.amount ?? null, platform: 'venmo-business' }; },
      'payments.get':           (p) => { this._requireConnected(); return { id: p.paymentId ?? null, status: null, platform: 'venmo-business' }; },
      'payments.list':          (p) => { this._requireConnected(); return { data: [], pagination: null, platform: 'venmo-business' }; },
      'payments.refund':        (p) => { this._requireConnected(); return { id: null, status: null, platform: 'venmo-business' }; },
      'customers.list':         (p) => { this._requireConnected(); return { data: [], pagination: null, platform: 'venmo-business' }; },
      'customers.get':          (p) => { this._requireConnected(); return { id: p.customerId ?? null, displayName: null, platform: 'venmo-business' }; },
      'reports.transactions':   (p) => { this._requireConnected(); return { data: [], totalCount: 0, platform: 'venmo-business' }; },
      'reports.settlements':    (p) => { this._requireConnected(); return { data: [], platform: 'venmo-business' }; },
      'webhooks.list':          (p) => { this._requireConnected(); return { webhooks: [], platform: 'venmo-business' }; },
      'disputes.list':          (p) => { this._requireConnected(); return { disputes: [], platform: 'venmo-business' }; },
      'balances.get':           (p) => { this._requireConnected(); return { available: null, pending: null, currency: 'USD', platform: 'venmo-business' }; },
      'profiles.get':           (p) => { this._requireConnected(); return { id: null, businessName: null, status: null, platform: 'venmo-business' }; },
    };
  }
}

export default VenmoBusinessConnector;
