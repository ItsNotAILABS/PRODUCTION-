import { XPlatformConnector } from '../platform-connector.js';

/**
 * PinterestShoppingConnector — X ecosystem adapter for Pinterest Shopping & Ads.
 * Operations: catalogs, products, ads, analytics, feeds.
 * Provide credentials.accessToken, credentials.adAccountId.
 */
export class PinterestShoppingConnector extends XPlatformConnector {
  constructor(credentials = {}) {
    super({
      name:         'pinterest-shopping',
      version:      '1.0.0',
      capabilities: ['catalogs', 'products', 'ads', 'analytics'],
      credentials,
    });
  }

  _operations() {
    return {
      'catalogs.list':        (p) => { this._requireConnected(); return { items: [], bookmark: null, platform: 'pinterest-shopping' }; },
      'catalogs.get':         (p) => { this._requireConnected(); return { id: p.catalogId ?? null, name: null, status: null, platform: 'pinterest-shopping' }; },
      'products.list':        (p) => { this._requireConnected(); return { items: [], bookmark: null, platform: 'pinterest-shopping' }; },
      'products.get':         (p) => { this._requireConnected(); return { catalog_product_group_id: p.id ?? null, status: null, platform: 'pinterest-shopping' }; },
      'products.create':      (p) => { this._requireConnected(); return { catalog_product_group_id: null, platform: 'pinterest-shopping' }; },
      'ads.campaigns':        (p) => { this._requireConnected(); return { items: [], bookmark: null, platform: 'pinterest-shopping' }; },
      'ads.adGroups':         (p) => { this._requireConnected(); return { items: [], bookmark: null, platform: 'pinterest-shopping' }; },
      'ads.pins':             (p) => { this._requireConnected(); return { items: [], bookmark: null, platform: 'pinterest-shopping' }; },
      'analytics.audience':   (p) => { this._requireConnected(); return { data: [], platform: 'pinterest-shopping' }; },
      'analytics.pins':       (p) => { this._requireConnected(); return { data: [], platform: 'pinterest-shopping' }; },
      'analytics.campaigns':  (p) => { this._requireConnected(); return { data: [], summary_metrics: null, platform: 'pinterest-shopping' }; },
      'feeds.get':            (p) => { this._requireConnected(); return { id: p.feedId ?? null, status: null, format: null, platform: 'pinterest-shopping' }; },
    };
  }
}

export default PinterestShoppingConnector;
