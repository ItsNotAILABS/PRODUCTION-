import { XPlatformConnector } from '../platform-connector.js';

/**
 * AfterpayConnector — X ecosystem adapter for Afterpay / Clearpay.
 * Operations: orders, payments, refunds, checkout, webhooks, merchants.
 * Provide credentials.merchantId, credentials.secretKey, credentials.environment.
 */
export class AfterpayConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'afterpay',
      version:      '1.0.0',
      capabilities: ['orders', 'payments', 'refunds'],
      credentials,
    });
  }

  _operations() {
    return {
      'orders.create':    (p) => { this._requireConnected(); return { id: null, token: null, expires: null, platform: 'afterpay' }; },
      'orders.get':       (p) => { this._requireConnected(); return { id: p.orderId ?? null, status: null, totalAmount: null, platform: 'afterpay' }; },
      'orders.capture':   (p) => { this._requireConnected(); return { id: null, status: null, totalAmount: null, platform: 'afterpay' }; },
      'orders.void':      (p) => { this._requireConnected(); return { id: p.orderId ?? null, platform: 'afterpay' }; },
      'refunds.create':   (p) => { this._requireConnected(); return { refundId: null, amount: p.amount ?? null, platform: 'afterpay' }; },
      'refunds.get':      (p) => { this._requireConnected(); return { refundId: p.refundId ?? null, status: null, platform: 'afterpay' }; },
      'payments.list':    (p) => { this._requireConnected(); return { results: [], totalResults: 0, platform: 'afterpay' }; },
      'payments.get':     (p) => { this._requireConnected(); return { id: p.paymentId ?? null, status: null, platform: 'afterpay' }; },
      'checkout.create':  (p) => { this._requireConnected(); return { token: null, expires: null, redirectCheckoutUrl: null, platform: 'afterpay' }; },
      'checkout.get':     (p) => { this._requireConnected(); return { token: p.token ?? null, status: null, consumer: null, platform: 'afterpay' }; },
      'webhooks.list':    (p) => { this._requireConnected(); return { webhooks: [], platform: 'afterpay' }; },
      'merchants.get':    (p) => { this._requireConnected(); return { id: null, name: null, status: null, platform: 'afterpay' }; },
    };
  }
}

export default AfterpayConnector;
