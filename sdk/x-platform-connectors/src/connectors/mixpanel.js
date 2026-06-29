import { XPlatformConnector } from '../platform-connector.js';

/**
 * MixpanelConnector — X ecosystem adapter for Mixpanel Analytics.
 * Operations: events, users, funnels, reports, segmentation, cohorts, annotations.
 * Provide credentials.projectToken, credentials.serviceAccountUsername, credentials.serviceAccountSecret, credentials.projectId.
 */
export class MixpanelConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'mixpanel',
      version:      '1.0.0',
      capabilities: ['events', 'users', 'funnels', 'reports'],
      credentials,
    });
  }

  _operations() {
    return {
      'events.track':         (p) => { this._requireConnected(); return { status: 1, error: null, platform: 'mixpanel' }; },
      'events.query':         (p) => { this._requireConnected(); return { data: { series: [], values: {} }, platform: 'mixpanel' }; },
      'users.get':            (p) => { this._requireConnected(); return { results: [], total: 0, page: 0, platform: 'mixpanel' }; },
      'users.set':            (p) => { this._requireConnected(); return { status: 1, error: null, platform: 'mixpanel' }; },
      'users.list':           (p) => { this._requireConnected(); return { results: [], total: 0, session_id: null, platform: 'mixpanel' }; },
      'funnels.get':          (p) => { this._requireConnected(); return { data: { steps: [], analysis: {} }, meta: null, platform: 'mixpanel' }; },
      'funnels.list':         (p) => { this._requireConnected(); return { results: [], platform: 'mixpanel' }; },
      'reports.insights':     (p) => { this._requireConnected(); return { series: {}, legend_size: 0, platform: 'mixpanel' }; },
      'reports.flows':        (p) => { this._requireConnected(); return { data: { steps: [] }, platform: 'mixpanel' }; },
      'segmentation.get':     (p) => { this._requireConnected(); return { data: { series: {}, unit: null }, platform: 'mixpanel' }; },
      'cohorts.list':         (p) => { this._requireConnected(); return { results: [], platform: 'mixpanel' }; },
      'annotations.list':     (p) => { this._requireConnected(); return { annotations: [], platform: 'mixpanel' }; },
    };
  }
}

export default MixpanelConnector;
