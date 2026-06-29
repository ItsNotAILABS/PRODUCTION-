import { XPlatformConnector } from '../platform-connector.js';

/**
 * CoinbaseCommerceConnector — X ecosystem adapter for Coinbase Commerce.
 * Operations: charges, events, webhooks, checkout, invoices.
 * Provide credentials.apiKey.
 */
export class CoinbaseCommerceConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'coinbase-commerce',
      version:      '1.0.0',
      capabilities: ['charges', 'payments', 'events'],
      credentials,
    });
  }

  _operations() {
    return {
      'charges.create':   (p) => { this._requireConnected(); return { data: { id: null, code: null, name: p.name ?? null, pricing: {} }, platform: 'coinbase-commerce' }; },
      'charges.get':      (p) => { this._requireConnected(); return { data: { id: p.chargeId ?? null, code: null, timeline: [] }, platform: 'coinbase-commerce' }; },
      'charges.list':     (p) => { this._requireConnected(); return { data: [], pagination: { cursor_range: null, limit: 25 }, platform: 'coinbase-commerce' }; },
      'charges.cancel':   (p) => { this._requireConnected(); return { data: { id: p.chargeId ?? null, timeline: [] }, platform: 'coinbase-commerce' }; },
      'events.list':      (p) => { this._requireConnected(); return { data: [], pagination: { cursor_range: null }, platform: 'coinbase-commerce' }; },
      'events.get':       (p) => { this._requireConnected(); return { data: { id: p.eventId ?? null, type: null }, platform: 'coinbase-commerce' }; },
      'webhooks.list':    (p) => { this._requireConnected(); return { data: [], platform: 'coinbase-commerce' }; },
      'checkout.create':  (p) => { this._requireConnected(); return { data: { id: null, name: p.name ?? null, pricing_type: null }, platform: 'coinbase-commerce' }; },
      'checkout.get':     (p) => { this._requireConnected(); return { data: { id: p.checkoutId ?? null, name: null }, platform: 'coinbase-commerce' }; },
      'invoices.create':  (p) => { this._requireConnected(); return { data: { id: null, code: null, status: null }, platform: 'coinbase-commerce' }; },
      'invoices.list':    (p) => { this._requireConnected(); return { data: [], platform: 'coinbase-commerce' }; },
      'invoices.void':    (p) => { this._requireConnected(); return { data: { id: p.invoiceId ?? null, status: 'VOID' }, platform: 'coinbase-commerce' }; },
    };
  }
}

export default CoinbaseCommerceConnector;
