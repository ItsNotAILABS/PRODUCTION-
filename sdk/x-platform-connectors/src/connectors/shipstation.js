import { XPlatformConnector } from '../platform-connector.js';

/**
 * ShipStationConnector — X ecosystem adapter for ShipStation.
 * Operations: orders, shipments, carriers, rates, warehouses, stores.
 * Provide credentials.apiKey, credentials.apiSecret.
 */
export class ShipStationConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'shipstation',
      version:      '1.0.0',
      capabilities: ['orders', 'shipments', 'carriers', 'warehouses'],
      credentials,
    });
  }

  _operations() {
    return {
      'orders.list':          (p) => { this._requireConnected(); return { orders: [], total: 0, page: 1, pages: 1, platform: 'shipstation' }; },
      'orders.get':           (p) => { this._requireConnected(); return { orderId: p.orderId ?? null, orderStatus: null, orderTotal: null, platform: 'shipstation' }; },
      'orders.create':        (p) => { this._requireConnected(); return { orderId: null, orderStatus: 'awaiting_payment', platform: 'shipstation' }; },
      'orders.hold':          (p) => { this._requireConnected(); return { orderId: p.orderId ?? null, platform: 'shipstation' }; },
      'shipments.list':       (p) => { this._requireConnected(); return { shipments: [], total: 0, page: 1, pages: 1, platform: 'shipstation' }; },
      'shipments.get':        (p) => { this._requireConnected(); return { shipmentId: p.shipmentId ?? null, trackingNumber: null, shipmentCost: null, platform: 'shipstation' }; },
      'shipments.create':     (p) => { this._requireConnected(); return { shipmentId: null, trackingNumber: null, labelData: null, platform: 'shipstation' }; },
      'shipments.voidLabel':  (p) => { this._requireConnected(); return { approved: null, message: null, platform: 'shipstation' }; },
      'carriers.list':        (p) => { this._requireConnected(); return { carriers: [], platform: 'shipstation' }; },
      'rates.get':            (p) => { this._requireConnected(); return { rates: [], platform: 'shipstation' }; },
      'warehouses.list':      (p) => { this._requireConnected(); return { warehouses: [], platform: 'shipstation' }; },
      'stores.list':          (p) => { this._requireConnected(); return { stores: [], platform: 'shipstation' }; },
    };
  }
}

export default ShipStationConnector;
