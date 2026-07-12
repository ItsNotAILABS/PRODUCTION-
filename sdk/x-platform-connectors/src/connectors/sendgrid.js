import { XPlatformConnector } from '../platform-connector.js';

/**
 * SendGridConnector — X ecosystem adapter for SendGrid Email.
 * Operations: email, templates, lists, contacts, analytics, suppressions, validate.
 * Provide credentials.apiKey.
 */
export class SendGridConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'sendgrid',
      version:      '1.0.0',
      capabilities: ['email', 'templates', 'lists', 'analytics'],
      credentials,
    });
  }

  _operations() {
    return {
      'email.send':           (p) => { this._requireConnected(); return { statusCode: null, platform: 'sendgrid' }; },
      'email.sendBatch':      (p) => { this._requireConnected(); return { batch_id: null, status: null, platform: 'sendgrid' }; },
      'templates.list':       (p) => { this._requireConnected(); return { result: [], platform: 'sendgrid' }; },
      'templates.get':        (p) => { this._requireConnected(); return { id: p.templateId ?? null, name: null, versions: [], platform: 'sendgrid' }; },
      'templates.create':     (p) => { this._requireConnected(); return { id: null, name: p.name ?? null, platform: 'sendgrid' }; },
      'lists.list':           (p) => { this._requireConnected(); return { result: [], _metadata: { count: 0 }, platform: 'sendgrid' }; },
      'contacts.add':         (p) => { this._requireConnected(); return { job_id: null, platform: 'sendgrid' }; },
      'contacts.search':      (p) => { this._requireConnected(); return { result: [], contact_count: 0, platform: 'sendgrid' }; },
      'analytics.global':     (p) => { this._requireConnected(); return { date: null, stats: [], platform: 'sendgrid' }; },
      'analytics.email':      (p) => { this._requireConnected(); return { date: null, stats: [], platform: 'sendgrid' }; },
      'suppressions.list':    (p) => { this._requireConnected(); return { result: [], platform: 'sendgrid' }; },
      'validate.email':       (p) => { this._requireConnected(); return { result: { email: p.email ?? null, verdict: null, score: null }, platform: 'sendgrid' }; },
    };
  }
}

export default SendGridConnector;
