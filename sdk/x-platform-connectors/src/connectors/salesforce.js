import { XPlatformConnector } from '../platform-connector.js';

/**
 * SalesforceConnector — X ecosystem adapter for Salesforce CRM.
 * Operations: leads, contacts, opportunities, accounts, reports.
 * Provide credentials.clientId, credentials.clientSecret, credentials.accessToken, credentials.instanceUrl.
 */
export class SalesforceConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'salesforce',
      version:      '1.0.0',
      capabilities: ['leads', 'contacts', 'opportunities', 'accounts', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'leads.list':           (p) => { this._requireConnected(); return { totalSize: 0, done: true, records: [], platform: 'salesforce' }; },
      'leads.get':            (p) => { this._requireConnected(); return { Id: p.id ?? null, Status: null, Email: null, platform: 'salesforce' }; },
      'leads.create':         (p) => { this._requireConnected(); return { id: null, success: null, errors: [], platform: 'salesforce' }; },
      'leads.convert':        (p) => { this._requireConnected(); return { accountId: null, contactId: null, opportunityId: null, platform: 'salesforce' }; },
      'contacts.list':        (p) => { this._requireConnected(); return { totalSize: 0, done: true, records: [], platform: 'salesforce' }; },
      'contacts.get':         (p) => { this._requireConnected(); return { Id: p.id ?? null, FirstName: null, LastName: null, Email: null, platform: 'salesforce' }; },
      'contacts.create':      (p) => { this._requireConnected(); return { id: null, success: null, errors: [], platform: 'salesforce' }; },
      'opportunities.list':   (p) => { this._requireConnected(); return { totalSize: 0, done: true, records: [], platform: 'salesforce' }; },
      'opportunities.get':    (p) => { this._requireConnected(); return { Id: p.id ?? null, Name: null, StageName: null, Amount: null, platform: 'salesforce' }; },
      'opportunities.create': (p) => { this._requireConnected(); return { id: null, success: null, errors: [], platform: 'salesforce' }; },
      'accounts.list':        (p) => { this._requireConnected(); return { totalSize: 0, done: true, records: [], platform: 'salesforce' }; },
      'reports.run':          (p) => { this._requireConnected(); return { reportMetadata: null, factMap: {}, groupingsDown: {}, platform: 'salesforce' }; },
    };
  }
}

export default SalesforceConnector;
