/**
 * PROTO-I022: Semantic Cache Protocol (SCP)
 * Derives from: VectorEmbeddingProtocol, MCPGatewayProtocol
 * Cache LLM responses by semantic similarity using cosine distance and phi-threshold.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class SemanticCacheProtocol {
  #cache     = new Map(); // key → { embedding, response, hitCount, lastAccessed, storedAt }
  #threshold = PHI_INV;  // default cosine similarity threshold (≈0.618)

  constructor(config = {}) {
    this.version   = '1.0.0';
    this.domain    = 'integrations';
    this.threshold = config.threshold ?? this.#threshold;
    this.#threshold = this.threshold;
    this.metrics   = { stores: 0, hits: 0, misses: 0, invalidations: 0 };
  }

  /**
   * Store a query/response pair with an optional embedding.
   * If no embedding provided, a simulated 8-float array is generated.
   */
  store(query, response, embedding) {
    const key = this.#keyFor(query);
    const vec  = embedding ?? this.#simulateEmbedding();
    this.#cache.set(key, {
      embedding   : vec,
      response,
      hitCount    : 0,
      lastAccessed: Date.now(),
      storedAt    : Date.now(),
    });
    this.metrics.stores++;
    return { key, dims: vec.length };
  }

  /**
   * Find cached entry whose embedding has cosine similarity >= threshold.
   * Returns { hit: true, response, similarity } or { hit: false }.
   */
  retrieve(queryEmbedding) {
    let bestKey   = null;
    let bestScore = -Infinity;

    for (const [key, entry] of this.#cache) {
      const sim = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim >= this.#threshold && sim > bestScore) {
        bestScore = sim;
        bestKey   = key;
      }
    }

    if (bestKey !== null) {
      const entry = this.#cache.get(bestKey);
      entry.hitCount++;
      entry.lastAccessed = Date.now();
      this.metrics.hits++;
      return { hit: true, response: entry.response, similarity: bestScore };
    }

    this.metrics.misses++;
    return { hit: false };
  }

  /** Cosine similarity between two equal-length numeric vectors. */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Remove a cache entry by key. */
  invalidate(key) {
    const existed = this.#cache.delete(key);
    if (existed) this.metrics.invalidations++;
    return existed;
  }

  /** Aggregate cache statistics. */
  stats() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total === 0 ? 0 : this.metrics.hits / total;

    let simSum = 0, simCount = 0;
    for (const entry of this.#cache.values()) {
      if (entry.hitCount > 0) {
        simSum   += PHI_INV * entry.hitCount;
        simCount += entry.hitCount;
      }
    }
    const avgSimilarity = simCount === 0 ? this.#threshold : simSum / simCount;

    return {
      size          : this.#cache.size,
      hitRate       : Math.round(hitRate * 1000) / 1000,
      avgSimilarity : Math.round(avgSimilarity * 1000) / 1000,
      threshold     : this.#threshold,
      ...this.metrics,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  #keyFor(query) {
    return `cache:${query.slice(0, 64).replace(/\s+/g, '_')}`;
  }

  #simulateEmbedding() {
    return Array.from({ length: 8 }, () => Math.random());
  }

  report() {
    return { version: this.version, domain: this.domain, stats: this.stats() };
  }
}

export default SemanticCacheProtocol;
