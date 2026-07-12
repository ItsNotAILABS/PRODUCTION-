import { XPlatformConnector } from '../platform-connector.js';

/**
 * RipplingConnector — X ecosystem adapter for Rippling HR Platform.
 * Operations: employees, payroll, apps, devices, groups, roles, policies.
 * Provide credentials.apiKey, credentials.clientId.
 */
export class RipplingConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'rippling',
      version:      '1.0.0',
      capabilities: ['employees', 'payroll', 'apps', 'devices'],
      credentials,
    });
  }

  _operations() {
    return {
      'employees.list':       (p) => { this._requireConnected(); return { data: [], next: null, platform: 'rippling' }; },
      'employees.get':        (p) => { this._requireConnected(); return { id: p.employeeId ?? null, displayName: null, workEmail: null, platform: 'rippling' }; },
      'employees.create':     (p) => { this._requireConnected(); return { id: null, displayName: p.displayName ?? null, platform: 'rippling' }; },
      'employees.update':     (p) => { this._requireConnected(); return { id: p.employeeId ?? null, platform: 'rippling' }; },
      'payroll.runs':         (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'payroll.getPaystubs':  (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'apps.list':            (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'apps.assign':          (p) => { this._requireConnected(); return { success: null, platform: 'rippling' }; },
      'devices.list':         (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'groups.list':          (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'roles.list':           (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
      'policies.list':        (p) => { this._requireConnected(); return { data: [], platform: 'rippling' }; },
    };
  }
}

export default RipplingConnector;
