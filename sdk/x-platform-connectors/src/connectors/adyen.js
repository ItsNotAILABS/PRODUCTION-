import { XPlatformConnector } from '../platform-connector.js';

/**
 * AdyenConnector — X ecosystem adapter for Adyen Payments.
 * Operations: payments, payouts, disputes, reports, balances, storedPaymentMethods.
 * Provide credentials.apiKey, credentials.merchantAccount, credentials.environment.
 */
export class AdyenConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'adyen',
      version:      '1.0.0',
      capabilities: ['payments', 'payouts', 'disputes', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'payments.create':              (p) => { this._requireConnected(); return { pspReference: null, resultCode: null, action: null, platform: 'adyen' }; },
      'payments.cancel':              (p) => { this._requireConnected(); return { pspReference: p.pspReference ?? null, status: null, platform: 'adyen' }; },
      'payments.refund':              (p) => { this._requireConnected(); return { pspReference: null, status: null, platform: 'adyen' }; },
      'payments.adjust':              (p) => { this._requireConnected(); return { pspReference: null, status: null, platform: 'adyen' }; },
      'payouts.create':               (p) => { this._requireConnected(); return { pspReference: null, resultCode: null, platform: 'adyen' }; },
      'payouts.confirm':              (p) => { this._requireConnected(); return { pspReference: p.pspReference ?? null, resultCode: null, platform: 'adyen' }; },
      'disputes.list':                (p) => { this._requireConnected(); return { disputes: [], total: 0, platform: 'adyen' }; },
      'disputes.defend':              (p) => { this._requireConnected(); return { disputeServiceResult: { success: null }, platform: 'adyen' }; },
      'reports.payments':             (p) => { this._requireConnected(); return { data: [], platform: 'adyen' }; },
      'reports.settlement':           (p) => { this._requireConnected(); return { data: [], platform: 'adyen' }; },
      'balances.get':                 (p) => { this._requireConnected(); return { balances: [], platform: 'adyen' }; },
      'storedPaymentMethods.list':    (p) => { this._requireConnected(); return { storedPaymentMethods: [], platform: 'adyen' }; },
    };
  }
}

export default AdyenConnector;
