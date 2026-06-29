import { XPlatformConnector } from '../platform-connector.js';

/**
 * EasyPostConnector — X ecosystem adapter for EasyPost Shipping.
 * Operations: shipments, addresses, rates, tracking, parcels, carriers, refunds, batches.
 * Provide credentials.apiKey.
 */
export class EasyPostConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'easypost',
      version:      '1.0.0',
      capabilities: ['shipments', 'addresses', 'rates', 'tracking'],
      credentials,
    });
  }

  _operations() {
    return {
      'shipments.create':     (p) => { this._requireConnected(); return { id: null, status: null, tracking_code: null, rates: [], platform: 'easypost' }; },
      'shipments.get':        (p) => { this._requireConnected(); return { id: p.shipmentId ?? null, status: null, platform: 'easypost' }; },
      'shipments.buy':        (p) => { this._requireConnected(); return { id: p.shipmentId ?? null, selected_rate: null, postage_label: { label_url: null }, platform: 'easypost' }; },
      'shipments.void':       (p) => { this._requireConnected(); return { message: null, platform: 'easypost' }; },
      'addresses.create':     (p) => { this._requireConnected(); return { id: null, street1: p.street1 ?? null, verifications: {}, platform: 'easypost' }; },
      'addresses.verify':     (p) => { this._requireConnected(); return { id: p.addressId ?? null, verifications: { delivery: { success: null } }, platform: 'easypost' }; },
      'rates.list':           (p) => { this._requireConnected(); return { rates: [], platform: 'easypost' }; },
      'tracking.get':         (p) => { this._requireConnected(); return { id: p.trackerId ?? null, status: null, tracking_details: [], platform: 'easypost' }; },
      'parcels.create':       (p) => { this._requireConnected(); return { id: null, weight: p.weight ?? null, length: null, width: null, height: null, platform: 'easypost' }; },
      'carriers.list':        (p) => { this._requireConnected(); return { carrier_accounts: [], platform: 'easypost' }; },
      'refunds.create':       (p) => { this._requireConnected(); return { refunds: [], platform: 'easypost' }; },
      'batches.create':       (p) => { this._requireConnected(); return { id: null, state: null, num_shipments: 0, platform: 'easypost' }; },
    };
  }
}

export default EasyPostConnector;
