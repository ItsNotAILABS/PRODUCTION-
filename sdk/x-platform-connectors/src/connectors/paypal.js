import { XPlatformConnector } from '../platform-connector.js';

/**
 * PayPalConnector — X ecosystem adapter for PayPal.
 * Operations: orders, payouts, invoices, subscriptions, transactions.
 * Provide credentials.clientId and credentials.clientSecret.
 */
export class PayPalConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'paypal',
      version:      '1.0.0',
      capabilities: ['payments', 'payouts', 'invoices', 'subscriptions', 'reports'],
      credentials,
    });
  }

  async connect() { await super.connect(); }

  _operations() {
    return {
      'orders.create':        (p) => ({ id: 'pp-ord-stub', status: 'CREATED', intent: p.intent ?? 'CAPTURE', platform: 'paypal' }),
      'orders.capture':       (p) => ({ id: p.order_id, status: 'COMPLETED', platform: 'paypal' }),
      'orders.get':           (p) => ({ id: p.order_id, status: 'CREATED', platform: 'paypal' }),
      'payouts.create':       (p) => ({ batch_header: { payout_batch_id: 'pp-pay-stub', batch_status: 'PENDING' }, platform: 'paypal' }),
      'payouts.get':          (p) => ({ batch_header: { payout_batch_id: p.payout_batch_id, batch_status: 'SUCCESS' }, platform: 'paypal' }),
      'invoices.list':        (p) => ({ total_count: 0, invoices: [], platform: 'paypal' }),
      'invoices.create':      (p) => ({ id: 'pp-inv-stub', status: 'DRAFT', ...p, platform: 'paypal' }),
      'invoices.send':        (p) => ({ id: p.invoice_id, status: 'SENT', platform: 'paypal' }),
      'subscriptions.create': (p) => ({ id: 'pp-sub-stub', status: 'ACTIVE', plan_id: p.plan_id, platform: 'paypal' }),
      'subscriptions.get':    (p) => ({ id: p.subscription_id, status: 'ACTIVE', platform: 'paypal' }),
      'subscriptions.cancel': (p) => ({ id: p.subscription_id, status: 'CANCELLED', platform: 'paypal' }),
      'transactions.list':    (p) => ({ transaction_details: [], total_items: 0, platform: 'paypal' }),
    };
  }
}

export default PayPalConnector;
