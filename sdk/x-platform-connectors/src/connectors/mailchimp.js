import { XPlatformConnector } from '../platform-connector.js';

/**
 * MailchimpConnector — X ecosystem adapter for Mailchimp Email Marketing.
 * Operations: campaigns, lists, members, automations, reports, templates.
 * Provide credentials.apiKey, credentials.server (e.g. us1).
 */
export class MailchimpConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'mailchimp',
      version:      '1.0.0',
      capabilities: ['campaigns', 'lists', 'automations', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'campaigns.list':       (p) => { this._requireConnected(); return { campaigns: [], total_items: 0, platform: 'mailchimp' }; },
      'campaigns.get':        (p) => { this._requireConnected(); return { id: p.campaignId ?? null, status: null, settings: {}, platform: 'mailchimp' }; },
      'campaigns.create':     (p) => { this._requireConnected(); return { id: null, status: 'save', type: p.type ?? null, platform: 'mailchimp' }; },
      'campaigns.send':       (p) => { this._requireConnected(); return { id: p.campaignId ?? null, platform: 'mailchimp' }; },
      'lists.list':           (p) => { this._requireConnected(); return { lists: [], total_items: 0, platform: 'mailchimp' }; },
      'lists.get':            (p) => { this._requireConnected(); return { id: p.listId ?? null, name: null, stats: {}, platform: 'mailchimp' }; },
      'members.list':         (p) => { this._requireConnected(); return { members: [], total_items: 0, platform: 'mailchimp' }; },
      'members.add':          (p) => { this._requireConnected(); return { id: null, email_address: p.email_address ?? null, status: null, platform: 'mailchimp' }; },
      'automations.list':     (p) => { this._requireConnected(); return { automations: [], total_items: 0, platform: 'mailchimp' }; },
      'automations.trigger':  (p) => { this._requireConnected(); return { platform: 'mailchimp' }; },
      'reports.campaign':     (p) => { this._requireConnected(); return { id: p.campaignId ?? null, emails_sent: 0, opens: {}, clicks: {}, platform: 'mailchimp' }; },
      'templates.list':       (p) => { this._requireConnected(); return { templates: [], total_items: 0, platform: 'mailchimp' }; },
    };
  }
}

export default MailchimpConnector;
