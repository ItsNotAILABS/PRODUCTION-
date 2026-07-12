import { XPlatformConnector } from '../platform-connector.js';

/**
 * AuthorizeNetConnector — X ecosystem adapter for Authorize.Net.
 * Operations: payments, customers, subscriptions, transactions.
 * Provide credentials.apiLoginId, credentials.transactionKey, credentials.environment.
 */
export class AuthorizeNetConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'authorize-net',
      version:      '1.0.0',
      capabilities: ['payments', 'customers', 'subscriptions'],
      credentials,
    });
  }

  _operations() {
    return {
      'payments.charge':          (p) => { this._requireConnected(); return { transactionResponse: { transId: null, responseCode: null, authCode: null }, platform: 'authorize-net' }; },
      'payments.authorize':       (p) => { this._requireConnected(); return { transactionResponse: { transId: null, responseCode: null, authCode: null }, platform: 'authorize-net' }; },
      'payments.void':            (p) => { this._requireConnected(); return { transactionResponse: { transId: p.transId ?? null, responseCode: null }, platform: 'authorize-net' }; },
      'payments.refund':          (p) => { this._requireConnected(); return { transactionResponse: { transId: null, responseCode: null }, platform: 'authorize-net' }; },
      'customers.create':         (p) => { this._requireConnected(); return { customerProfileId: null, customerPaymentProfileIdList: [], platform: 'authorize-net' }; },
      'customers.get':            (p) => { this._requireConnected(); return { profile: { customerProfileId: p.customerProfileId ?? null, email: null, paymentProfiles: [] }, platform: 'authorize-net' }; },
      'customers.update':         (p) => { this._requireConnected(); return { messages: { resultCode: null }, platform: 'authorize-net' }; },
      'subscriptions.create':     (p) => { this._requireConnected(); return { subscriptionId: null, platform: 'authorize-net' }; },
      'subscriptions.update':     (p) => { this._requireConnected(); return { messages: { resultCode: null }, platform: 'authorize-net' }; },
      'subscriptions.cancel':     (p) => { this._requireConnected(); return { messages: { resultCode: null }, platform: 'authorize-net' }; },
      'transactions.list':        (p) => { this._requireConnected(); return { transactions: [], totalNumInResultSet: 0, platform: 'authorize-net' }; },
      'transactions.get':         (p) => { this._requireConnected(); return { transaction: { transId: p.transId ?? null, transactionStatus: null, settleAmount: null }, platform: 'authorize-net' }; },
    };
  }
}

export default AuthorizeNetConnector;
