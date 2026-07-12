import { XPlatformConnector } from '../platform-connector.js';

/**
 * TikTokShopConnector — X ecosystem adapter for TikTok Shop.
 * Operations: products, orders, logistics, shop, promotions, returns.
 * Provide credentials.appKey, credentials.appSecret, credentials.accessToken, credentials.shopId.
 */
export class TikTokShopConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'tiktok-shop',
      version:      '1.0.0',
      capabilities: ['products', 'orders', 'logistics', 'shop'],
      credentials,
    });
  }

  _operations() {
    return {
      'products.list':      (p) => { this._requireConnected(); return { products: [], total: 0, next_page_token: null, platform: 'tiktok-shop' }; },
      'products.get':       (p) => { this._requireConnected(); return { product: { product_id: p.productId ?? null, status: null }, platform: 'tiktok-shop' }; },
      'products.create':    (p) => { this._requireConnected(); return { product_id: null, platform: 'tiktok-shop' }; },
      'orders.list':        (p) => { this._requireConnected(); return { order_list: [], total: 0, page_token: null, platform: 'tiktok-shop' }; },
      'orders.get':         (p) => { this._requireConnected(); return { order: { order_id: p.orderId ?? null, status: null }, platform: 'tiktok-shop' }; },
      'orders.confirm':     (p) => { this._requireConnected(); return { order_id: p.orderId ?? null, platform: 'tiktok-shop' }; },
      'orders.cancel':      (p) => { this._requireConnected(); return { order_id: p.orderId ?? null, platform: 'tiktok-shop' }; },
      'logistics.getInfo':  (p) => { this._requireConnected(); return { shipping_provider_list: [], platform: 'tiktok-shop' }; },
      'shop.get':           (p) => { this._requireConnected(); return { shop: { shop_id: null, shop_name: null, region: null }, platform: 'tiktok-shop' }; },
      'shop.metrics':       (p) => { this._requireConnected(); return { metrics: { gmv: 0, orders: 0, buyers: 0 }, platform: 'tiktok-shop' }; },
      'promotions.list':    (p) => { this._requireConnected(); return { promotions: [], total: 0, platform: 'tiktok-shop' }; },
      'returns.list':       (p) => { this._requireConnected(); return { return_list: [], total: 0, platform: 'tiktok-shop' }; },
    };
  }
}

export default TikTokShopConnector;
