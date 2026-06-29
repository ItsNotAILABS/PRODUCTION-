import { XPlatformConnector } from '../platform-connector.js';

/**
 * PipedriveConnector — X ecosystem adapter for Pipedrive CRM.
 * Operations: deals, contacts, activities, pipeline, stages, organizations.
 * Provide credentials.apiToken or credentials.accessToken (OAuth).
 */
export class PipedriveConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'pipedrive',
      version:      '1.0.0',
      capabilities: ['deals', 'contacts', 'activities', 'pipeline'],
      credentials,
    });
  }

  _operations() {
    return {
      'deals.list':           (p) => { this._requireConnected(); return { data: [], additional_data: { pagination: { start: 0, more_items_in_collection: false } }, platform: 'pipedrive' }; },
      'deals.get':            (p) => { this._requireConnected(); return { data: { id: p.id ?? null, title: null, status: null, value: null }, platform: 'pipedrive' }; },
      'deals.create':         (p) => { this._requireConnected(); return { data: { id: null, title: p.title ?? null }, platform: 'pipedrive' }; },
      'deals.update':         (p) => { this._requireConnected(); return { data: { id: p.id ?? null }, platform: 'pipedrive' }; },
      'contacts.list':        (p) => { this._requireConnected(); return { data: [], additional_data: { pagination: { start: 0, more_items_in_collection: false } }, platform: 'pipedrive' }; },
      'contacts.get':         (p) => { this._requireConnected(); return { data: { id: p.id ?? null, name: null, email: [] }, platform: 'pipedrive' }; },
      'contacts.create':      (p) => { this._requireConnected(); return { data: { id: null, name: p.name ?? null }, platform: 'pipedrive' }; },
      'activities.list':      (p) => { this._requireConnected(); return { data: [], additional_data: null, platform: 'pipedrive' }; },
      'activities.create':    (p) => { this._requireConnected(); return { data: { id: null, type: p.type ?? null }, platform: 'pipedrive' }; },
      'pipeline.list':        (p) => { this._requireConnected(); return { data: [], platform: 'pipedrive' }; },
      'stages.list':          (p) => { this._requireConnected(); return { data: [], platform: 'pipedrive' }; },
      'organizations.list':   (p) => { this._requireConnected(); return { data: [], additional_data: null, platform: 'pipedrive' }; },
    };
  }
}

export default PipedriveConnector;
