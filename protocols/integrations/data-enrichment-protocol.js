/**
 * PROTO-I012: Data Enrichment Protocol (DEP)
 * Derives from: DataNormalizationProtocol, MemoryPalaceProtocol
 * Cross-platform data enrichment with parallel fetches, dedup, and phi-weighted source priority.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class DataEnrichmentProtocol {
  #enrichers = new Map(); // field → [{ source, fetch, priority }]
  #cache     = new Map(); // `${field}:${id}` → value

  constructor(config = {}) {
    this.version    = '1.0.0';
    this.domain     = 'integrations';
    this.cacheMaxMs = config.cacheMaxMs ?? 300_000; // 5 min
    this.metrics    = { enriched: 0, cacheHits: 0, fetches: 0, misses: 0 };
  }

  /** Register an enrichment source for a field. */
  registerEnricher(field, { source, fetch: fetchFn, priority = 1 }) {
    if (!this.#enrichers.has(field)) this.#enrichers.set(field, []);
    const list = this.#enrichers.get(field);
    list.push({ source, fetch: fetchFn, priority });
    // Sort by phi-weighted priority (higher priority first)
    list.sort((a, b) => b.priority * PHI - a.priority * PHI);
    return { field, source, priority };
  }

  /** Enrich a single record with missing field values fetched in parallel. */
  async enrich(record, fields = []) {
    const missing = fields.filter((f) => record[f] == null && this.#enrichers.has(f));
    const id      = record.id ?? record._id ?? JSON.stringify(record).slice(0, 32);

    const enriched = { ...record };
    await Promise.all(missing.map(async (field) => {
      const val = await this.#fetchField(field, id);
      if (val !== undefined) enriched[field] = val;
    }));
    this.metrics.enriched++;
    return enriched;
  }

  /** Enrich a batch of records, deduplicating fetch calls by id+field. */
  async enrichBatch(records = [], fields = []) {
    // Collect unique (field, id) pairs needing fetch
    const needed = new Map(); // `${field}:${id}` → [recordIndexes]
    for (let i = 0; i < records.length; i++) {
      const id = records[i].id ?? records[i]._id ?? String(i);
      for (const field of fields) {
        if (records[i][field] == null && this.#enrichers.has(field)) {
          const key = `${field}:${id}`;
          if (!needed.has(key)) needed.set(key, { field, id, idxs: [] });
          needed.get(key).idxs.push(i);
        }
      }
    }

    const result = records.map((r) => ({ ...r }));
    await Promise.all([...needed.entries()].map(async ([, { field, id, idxs }]) => {
      const val = await this.#fetchField(field, id);
      if (val !== undefined) for (const i of idxs) result[i][field] = val;
    }));

    return result;
  }

  async #fetchField(field, id) {
    const cacheKey = `${field}:${id}`;
    const cached   = this.#cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheMaxMs) {
      this.metrics.cacheHits++;
      return cached.value;
    }

    const enrichers = this.#enrichers.get(field) ?? [];
    for (const { fetch: fetchFn } of enrichers) {
      try {
        this.metrics.fetches++;
        const val = await fetchFn(id);
        if (val !== undefined) {
          this.#cache.set(cacheKey, { value: val, ts: Date.now() });
          return val;
        }
      } catch { /* try next source */ }
    }
    this.metrics.misses++;
    return undefined;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default DataEnrichmentProtocol;
