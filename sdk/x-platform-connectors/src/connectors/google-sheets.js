import { XPlatformConnector } from '../platform-connector.js';

/**
 * GoogleSheetsConnector — X ecosystem adapter for Google Sheets.
 * Operations: spreadsheets, sheets, values, charts, formatting, permissions.
 * Provide credentials.accessToken, credentials.serviceAccountKey (JSON).
 */
export class GoogleSheetsConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'google-sheets',
      version:      '1.0.0',
      capabilities: ['spreadsheets', 'sheets', 'values', 'charts'],
      credentials,
    });
  }

  _operations() {
    return {
      'spreadsheets.get':     (p) => { this._requireConnected(); return { spreadsheetId: p.spreadsheetId ?? null, properties: { title: null }, sheets: [], platform: 'google-sheets' }; },
      'spreadsheets.create':  (p) => { this._requireConnected(); return { spreadsheetId: null, spreadsheetUrl: null, platform: 'google-sheets' }; },
      'sheets.list':          (p) => { this._requireConnected(); return { sheets: [], platform: 'google-sheets' }; },
      'sheets.add':           (p) => { this._requireConnected(); return { replies: [{ addSheet: { properties: { sheetId: null, title: null } } }], platform: 'google-sheets' }; },
      'values.get':           (p) => { this._requireConnected(); return { spreadsheetId: p.spreadsheetId ?? null, range: p.range ?? null, majorDimension: null, values: [], platform: 'google-sheets' }; },
      'values.update':        (p) => { this._requireConnected(); return { spreadsheetId: p.spreadsheetId ?? null, updatedRange: null, updatedRows: 0, updatedColumns: 0, updatedCells: 0, platform: 'google-sheets' }; },
      'values.append':        (p) => { this._requireConnected(); return { spreadsheetId: p.spreadsheetId ?? null, updates: { updatedRange: null, updatedRows: 0 }, platform: 'google-sheets' }; },
      'values.clear':         (p) => { this._requireConnected(); return { spreadsheetId: p.spreadsheetId ?? null, clearedRange: null, platform: 'google-sheets' }; },
      'charts.list':          (p) => { this._requireConnected(); return { charts: [], platform: 'google-sheets' }; },
      'charts.add':           (p) => { this._requireConnected(); return { replies: [{ addChart: { chart: { chartId: null } } }], platform: 'google-sheets' }; },
      'formatting.apply':     (p) => { this._requireConnected(); return { replies: [], platform: 'google-sheets' }; },
      'permissions.list':     (p) => { this._requireConnected(); return { permissions: [], platform: 'google-sheets' }; },
    };
  }
}

export default GoogleSheetsConnector;
