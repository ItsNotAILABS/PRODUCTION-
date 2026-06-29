import { XPlatformConnector } from '../platform-connector.js';

/**
 * GustoConnector — X ecosystem adapter for Gusto HR & Payroll.
 * Operations: employees, payroll, benefits, time, departments.
 * Provide credentials.clientId, credentials.clientSecret, credentials.accessToken, credentials.companyId.
 */
export class GustoConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'gusto',
      version:      '1.0.0',
      capabilities: ['employees', 'payroll', 'benefits', 'time'],
      credentials,
    });
  }

  _operations() {
    return {
      'employees.list':       (p) => { this._requireConnected(); return { employees: [], platform: 'gusto' }; },
      'employees.get':        (p) => { this._requireConnected(); return { id: p.employeeId ?? null, first_name: null, last_name: null, email: null, platform: 'gusto' }; },
      'employees.create':     (p) => { this._requireConnected(); return { id: null, first_name: p.first_name ?? null, platform: 'gusto' }; },
      'employees.update':     (p) => { this._requireConnected(); return { id: p.employeeId ?? null, platform: 'gusto' }; },
      'payroll.list':         (p) => { this._requireConnected(); return { payrolls: [], platform: 'gusto' }; },
      'payroll.calculate':    (p) => { this._requireConnected(); return { payroll: { gross_pay: null, net_pay: null }, platform: 'gusto' }; },
      'payroll.submit':       (p) => { this._requireConnected(); return { payroll: { pay_period: null, processed: null }, platform: 'gusto' }; },
      'benefits.list':        (p) => { this._requireConnected(); return { company_benefits: [], platform: 'gusto' }; },
      'benefits.get':         (p) => { this._requireConnected(); return { id: p.benefitId ?? null, name: null, active: null, platform: 'gusto' }; },
      'time.entries':         (p) => { this._requireConnected(); return { time_off_requests: [], platform: 'gusto' }; },
      'time.policies':        (p) => { this._requireConnected(); return { time_off_policies: [], platform: 'gusto' }; },
      'departments.list':     (p) => { this._requireConnected(); return { departments: [], platform: 'gusto' }; },
    };
  }
}

export default GustoConnector;
