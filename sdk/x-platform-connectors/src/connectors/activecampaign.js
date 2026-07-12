import { XPlatformConnector } from '../platform-connector.js';

/**
 * ActiveCampaignConnector — X ecosystem adapter for ActiveCampaign Marketing Automation.
 * Operations: contacts, campaigns, automations, deals, tags, messages.
 * Provide credentials.apiUrl, credentials.apiKey.
 */
export class ActiveCampaignConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'activecampaign',
      version:      '1.0.0',
      capabilities: ['contacts', 'campaigns', 'automations', 'deals'],
      credentials,
    });
  }

  _operations() {
    return {
      'contacts.list':          (p) => { this._requireConnected(); return { contacts: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'contacts.get':           (p) => { this._requireConnected(); return { contact: { id: p.id ?? null, email: null }, platform: 'activecampaign' }; },
      'contacts.create':        (p) => { this._requireConnected(); return { contact: { id: null, email: p.email ?? null }, platform: 'activecampaign' }; },
      'contacts.update':        (p) => { this._requireConnected(); return { contact: { id: p.id ?? null }, platform: 'activecampaign' }; },
      'campaigns.list':         (p) => { this._requireConnected(); return { campaigns: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'campaigns.get':          (p) => { this._requireConnected(); return { campaign: { id: p.id ?? null, name: null, status: null }, platform: 'activecampaign' }; },
      'automations.list':       (p) => { this._requireConnected(); return { automations: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'automations.contacts':   (p) => { this._requireConnected(); return { contactAutomations: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'deals.list':             (p) => { this._requireConnected(); return { deals: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'deals.create':           (p) => { this._requireConnected(); return { deal: { id: null, title: p.title ?? null, value: null }, platform: 'activecampaign' }; },
      'tags.list':              (p) => { this._requireConnected(); return { tags: [], meta: { total: '0' }, platform: 'activecampaign' }; },
      'messages.list':          (p) => { this._requireConnected(); return { messages: [], meta: { total: '0' }, platform: 'activecampaign' }; },
    };
  }
}

export default ActiveCampaignConnector;
