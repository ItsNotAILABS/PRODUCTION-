import { XPlatformConnector } from '../platform-connector.js';

/**
 * StripeConnector — X ecosystem adapter for Stripe.
 * Operations: payments, customers, subscriptions, invoices, payouts, balance, reports.
 * Provide credentials.secretKey (sk_live_… or sk_test_…).
 */
export class StripeConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'stripe',
      version:      '1.0.0',
      capabilities: ['payments', 'customers', 'subscriptions', 'invoices', 'payouts', 'reports'],
      credentials,
    });
  }

  async connect() {
    const { secretKey } = this.credentials;
    if (secretKey && !secretKey.startsWith('sk_')) {
      throw new Error('StripeConnector: secretKey must start with sk_live_ or sk_test_');
    }
    await super.connect();
  }

  _operations() {
    return {
      'payments.list':        (p) => ({ data: [], has_more: false, platform: 'stripe' }),
      'payments.create':      (p) => ({ id: 'pi_stub', status: 'requires_capture', amount: p.amount, currency: p.currency ?? 'usd', platform: 'stripe' }),
      'payments.capture':     (p) => ({ id: p.payment_intent_id, status: 'succeeded', platform: 'stripe' }),
      'customers.list':       (p) => ({ data: [], has_more: false, platform: 'stripe' }),
      'customers.create':     (p) => ({ id: 'cus_stub', email: p.email, name: p.name, platform: 'stripe' }),
      'customers.get':        (p) => ({ id: p.id, object: 'customer', platform: 'stripe' }),
      'subscriptions.list':   (p) => ({ data: [], has_more: false, platform: 'stripe' }),
      'subscriptions.create': (p) => ({ id: 'sub_stub', customer: p.customer, status: 'active', platform: 'stripe' }),
      'subscriptions.cancel': (p) => ({ id: p.subscription_id, status: 'canceled', platform: 'stripe' }),
      'invoices.list':        (p) => ({ data: [], has_more: false, platform: 'stripe' }),
      'invoices.get':         (p) => ({ id: p.id, status: 'draft', platform: 'stripe' }),
      'invoices.pay':         (p) => ({ id: p.id, status: 'paid', platform: 'stripe' }),
      'payouts.list':         (p) => ({ data: [], has_more: false, platform: 'stripe' }),
      'balance.retrieve':     ()  => ({ available: [], pending: [], platform: 'stripe' }),
      'reports.revenue':      (p) => ({ data: { revenue: 0, currency: 'usd' }, platform: 'stripe' }),
    };
  }
}

export default StripeConnector;
