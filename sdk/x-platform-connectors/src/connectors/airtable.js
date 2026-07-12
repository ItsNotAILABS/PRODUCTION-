import { XPlatformConnector } from '../platform-connector.js';

/**
 * AirtableConnector — X ecosystem adapter for Airtable.
 * Operations: bases, tables, records, views, fields.
 * Provide credentials.accessToken.
 */
export class AirtableConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'airtable',
      version:      '1.0.0',
      capabilities: ['bases', 'tables', 'records', 'views'],
      credentials,
    });
  }

  _operations() {
    return {
      'bases.list':       (p) => { this._requireConnected(); return { bases: [], offset: null, platform: 'airtable' }; },
      'bases.get':        (p) => { this._requireConnected(); return { id: p.baseId ?? null, name: null, permissionLevel: null, platform: 'airtable' }; },
      'tables.list':      (p) => { this._requireConnected(); return { tables: [], platform: 'airtable' }; },
      'tables.get':       (p) => { this._requireConnected(); return { id: p.tableId ?? null, name: null, fields: [], views: [], platform: 'airtable' }; },
      'tables.create':    (p) => { this._requireConnected(); return { id: null, name: p.name ?? null, platform: 'airtable' }; },
      'records.list':     (p) => { this._requireConnected(); return { records: [], offset: null, platform: 'airtable' }; },
      'records.get':      (p) => { this._requireConnected(); return { id: p.recordId ?? null, fields: {}, createdTime: null, platform: 'airtable' }; },
      'records.create':   (p) => { this._requireConnected(); return { records: [], platform: 'airtable' }; },
      'records.update':   (p) => { this._requireConnected(); return { records: [], platform: 'airtable' }; },
      'records.delete':   (p) => { this._requireConnected(); return { records: [], platform: 'airtable' }; },
      'views.list':       (p) => { this._requireConnected(); return { views: [], platform: 'airtable' }; },
      'fields.list':      (p) => { this._requireConnected(); return { fields: [], platform: 'airtable' }; },
    };
  }
}

export default AirtableConnector;
