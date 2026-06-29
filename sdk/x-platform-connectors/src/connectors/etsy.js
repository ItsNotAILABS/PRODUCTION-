import { XPlatformConnector } from '../platform-connector.js';

/**
 * EtsyConnector — X ecosystem adapter for Etsy Seller.
 * Operations: listings, orders, shop, reviews, inventory.
 * Provide credentials.apiKey, credentials.accessToken, credentials.shopId.
 */
export class EtsyConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'etsy',
      version:      '1.0.0',
      capabilities: ['listings', 'orders', 'shop', 'reviews'],
      credentials,
    });
  }

  _operations() {
    return {
      'listings.list':    (p) => { this._requireConnected(); return { results: [], count: 0, params: null, platform: 'etsy' }; },
      'listings.get':     (p) => { this._requireConnected(); return { listing: { listing_id: p.listingId ?? null, state: null }, platform: 'etsy' }; },
      'listings.create':  (p) => { this._requireConnected(); return { listing: { listing_id: null, state: 'draft' }, platform: 'etsy' }; },
      'listings.update':  (p) => { this._requireConnected(); return { listing: { listing_id: p.listingId ?? null, state: null }, platform: 'etsy' }; },
      'orders.list':      (p) => { this._requireConnected(); return { results: [], count: 0, platform: 'etsy' }; },
      'orders.get':       (p) => { this._requireConnected(); return { receipt: { receipt_id: p.receiptId ?? null, status: null }, platform: 'etsy' }; },
      'orders.ship':      (p) => { this._requireConnected(); return { receipt: { receipt_id: p.receiptId ?? null, shipped: null }, platform: 'etsy' }; },
      'shop.get':         (p) => { this._requireConnected(); return { shop: { shop_id: null, shop_name: null }, platform: 'etsy' }; },
      'shop.update':      (p) => { this._requireConnected(); return { shop: { shop_id: null }, platform: 'etsy' }; },
      'reviews.list':     (p) => { this._requireConnected(); return { results: [], count: 0, platform: 'etsy' }; },
      'inventory.get':    (p) => { this._requireConnected(); return { products: [], price_on_property: [], quantity_on_property: [], sku_on_property: [], platform: 'etsy' }; },
      'inventory.update': (p) => { this._requireConnected(); return { products: [], platform: 'etsy' }; },
    };
  }
}

export default EtsyConnector;
