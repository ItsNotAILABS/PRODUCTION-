/**
 * PROTO-I017: Product Catalog Protocol (PCP)
 * Derives from: CrossPlatformSyncProtocol, InventoryOptimizationProtocol
 * Unified product catalog across platforms with conflict resolution via phi-weighted freshness.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class ProductCatalogProtocol {
  #catalog = new Map(); // sku → { title, description, price, inventory, platforms, platformData: Map, updatedAt }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { products: 0, synced: 0, conflicts: 0 };
  }

  /** Upsert a product into the canonical catalog. */
  upsertProduct(sku, { title, description, price, inventory = 0, platforms = [] } = {}) {
    const existing = this.#catalog.get(sku);
    if (!existing) {
      this.#catalog.set(sku, {
        sku, title, description, price, inventory,
        platforms: new Set(platforms),
        platformData: new Map(),
        updatedAt: Date.now(),
      });
      this.metrics.products++;
    } else {
      Object.assign(existing, { title, description, price, inventory, updatedAt: Date.now() });
      for (const p of platforms) existing.platforms.add(p);
    }
    return { sku, upserted: true };
  }

  /** Sync a product to a platform. Returns the diff from the platform's last known state. */
  syncToPlatform(sku, platform) {
    const product = this.#getProduct(sku);
    const prev    = product.platformData.get(platform) ?? {};
    const current = { title: product.title, description: product.description, price: product.price, inventory: product.inventory };
    const diff    = this.#diff(prev, current);
    product.platformData.set(platform, { ...current, syncedAt: Date.now() });
    product.platforms.add(platform);
    this.metrics.synced++;
    return { sku, platform, diff, hasChanges: Object.keys(diff).length > 0 };
  }

  /** Query products by filters. */
  query({ category, minPrice, maxPrice, inStock, tags = [] } = {}) {
    return [...this.#catalog.values()].filter((p) => {
      if (minPrice != null && p.price < minPrice) return false;
      if (maxPrice != null && p.price > maxPrice) return false;
      if (inStock && p.inventory <= 0) return false;
      if (tags.length && !tags.every((t) => p.tags?.includes(t))) return false;
      if (category && p.category !== category) return false;
      return true;
    }).map((p) => ({
      sku: p.sku, title: p.title, price: p.price, inventory: p.inventory,
      platforms: [...p.platforms],
    }));
  }

  /** Merge incoming platform data with conflict resolution via phi-weighted freshness. */
  mergePlatformData(sku, platform, incomingData) {
    const product = this.#getProduct(sku);
    const existing = product.platformData.get(platform) ?? {};
    const conflicts = [];

    for (const [key, val] of Object.entries(incomingData)) {
      if (key in existing && existing[key] !== val) {
        conflicts.push({ field: key, canonical: product[key], incoming: val });
        // phi-weighted freshness: newer data wins, scaled by PHI
        const incomingTs = incomingData.updatedAt ?? 0;
        const existingTs = existing.syncedAt ?? 0;
        const phiFresh   = (incomingTs - existingTs) * PHI_INV;
        if (phiFresh > 0 && key in product) {
          product[key] = val;
          this.metrics.conflicts++;
        }
      } else {
        if (key in product && product[key] === undefined) product[key] = val;
      }
    }

    product.platformData.set(platform, { ...existing, ...incomingData, syncedAt: Date.now() });
    return { sku, platform, conflicts };
  }

  #getProduct(sku) {
    const p = this.#catalog.get(sku);
    if (!p) throw new Error(`Product not found: ${sku}`);
    return p;
  }

  #diff(prev, curr) {
    const diff = {};
    for (const key of new Set([...Object.keys(prev), ...Object.keys(curr)])) {
      if (prev[key] !== curr[key]) diff[key] = { from: prev[key], to: curr[key] };
    }
    return diff;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default ProductCatalogProtocol;
