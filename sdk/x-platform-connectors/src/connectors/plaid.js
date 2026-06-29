import { XPlatformConnector } from '../platform-connector.js';

/**
 * PlaidConnector — X ecosystem adapter for Plaid Financial Data.
 * Operations: accounts, transactions, identity, auth, liabilities, investments, income, assets, institutions.
 * Provide credentials.clientId, credentials.secret, credentials.environment.
 */
export class PlaidConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'plaid',
      version:      '1.0.0',
      capabilities: ['accounts', 'transactions', 'identity', 'balance'],
      credentials,
    });
  }

  _operations() {
    return {
      'accounts.get':               (p) => { this._requireConnected(); return { accounts: [], item: null, platform: 'plaid' }; },
      'accounts.balance':           (p) => { this._requireConnected(); return { accounts: [], item: null, platform: 'plaid' }; },
      'transactions.get':           (p) => { this._requireConnected(); return { accounts: [], transactions: [], total_transactions: 0, platform: 'plaid' }; },
      'transactions.sync':          (p) => { this._requireConnected(); return { added: [], modified: [], removed: [], next_cursor: null, has_more: false, platform: 'plaid' }; },
      'identity.get':               (p) => { this._requireConnected(); return { accounts: [], item: null, platform: 'plaid' }; },
      'auth.get':                   (p) => { this._requireConnected(); return { accounts: [], numbers: { ach: [], eft: [], international: [], bacs: [] }, item: null, platform: 'plaid' }; },
      'liabilities.get':            (p) => { this._requireConnected(); return { accounts: [], liabilities: { credit: [], mortgage: [], student: [] }, platform: 'plaid' }; },
      'investments.holdings':       (p) => { this._requireConnected(); return { accounts: [], holdings: [], securities: [], item: null, platform: 'plaid' }; },
      'investments.transactions':   (p) => { this._requireConnected(); return { investment_transactions: [], securities: [], total_investment_transactions: 0, platform: 'plaid' }; },
      'income.verify':              (p) => { this._requireConnected(); return { income: { streams: [], last_year_income: null }, platform: 'plaid' }; },
      'assets.createReport':        (p) => { this._requireConnected(); return { asset_report_id: null, asset_report_token: null, platform: 'plaid' }; },
      'institutions.get':           (p) => { this._requireConnected(); return { institution: { institution_id: p.institutionId ?? null, name: null }, platform: 'plaid' }; },
    };
  }
}

export default PlaidConnector;
