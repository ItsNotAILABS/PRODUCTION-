import { XPlatformConnector } from '../platform-connector.js';

/**
 * BraintreeConnector — X ecosystem adapter for Braintree Payments (PayPal).
 * Operations: payments, customers, subscriptions, vaults, paymentMethods.
 * Provide credentials.merchantId, credentials.publicKey, credentials.privateKey, credentials.environment.
 */
export class BraintreeConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'braintree',
      version:      '1.0.0',
      capabilities: ['payments', 'customers', 'subscriptions', 'vaults'],
      credentials,
    });
  }

  _operations() {
    return {
      'payments.sale':            (p) => { this._requireConnected(); return { transaction: { id: null, status: null, amount: p.amount ?? null }, platform: 'braintree' }; },
      'payments.authorize':       (p) => { this._requireConnected(); return { transaction: { id: null, status: 'authorized', amount: p.amount ?? null }, platform: 'braintree' }; },
      'payments.capture':         (p) => { this._requireConnected(); return { transaction: { id: p.transactionId ?? null, status: 'submitted_for_settlement' }, platform: 'braintree' }; },
      'payments.void':            (p) => { this._requireConnected(); return { transaction: { id: p.transactionId ?? null, status: 'voided' }, platform: 'braintree' }; },
      'payments.refund':          (p) => { this._requireConnected(); return { transaction: { id: null, status: 'submitted_for_settlement', type: 'credit' }, platform: 'braintree' }; },
      'customers.create':         (p) => { this._requireConnected(); return { customer: { id: null, email: p.email ?? null }, platform: 'braintree' }; },
      'customers.get':            (p) => { this._requireConnected(); return { customer: { id: p.customerId ?? null, paymentMethods: [] }, platform: 'braintree' }; },
      'customers.update':         (p) => { this._requireConnected(); return { customer: { id: p.customerId ?? null }, platform: 'braintree' }; },
      'subscriptions.create':     (p) => { this._requireConnected(); return { subscription: { id: null, status: 'Active', planId: p.planId ?? null }, platform: 'braintree' }; },
      'subscriptions.cancel':     (p) => { this._requireConnected(); return { subscription: { id: p.subscriptionId ?? null, status: 'Canceled' }, platform: 'braintree' }; },
      'vaults.create':            (p) => { this._requireConnected(); return { paymentMethod: { token: null, customerId: p.customerId ?? null }, platform: 'braintree' }; },
      'paymentMethods.get':       (p) => { this._requireConnected(); return { paymentMethod: { token: p.token ?? null, type: null }, platform: 'braintree' }; },
    };
  }
}

export default BraintreeConnector;
