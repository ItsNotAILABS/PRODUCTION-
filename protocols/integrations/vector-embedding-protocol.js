/**
 * PROTO-I026: Vector Embedding Protocol (VEP)
 * Derives from: DataEnrichmentProtocol, MCPGatewayProtocol
 * Vector embedding storage and semantic search using cosine similarity
 * with phi-weighted similarity thresholds.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class VectorEmbeddingProtocol {
  #embeddings = new Map(); // id → { vector, metadata, storedAt }
  #dims       = 128;

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.#dims    = config.dims ?? 128;
    this.metrics  = { stored: 0, searches: 0, deletes: 0, prunes: 0 };
  }

  /** Store a vector embedding with optional metadata. */
  store(id, vector, metadata = {}) {
    if (vector.length !== this.#dims) {
      throw new Error(`Vector dimension mismatch: expected ${this.#dims}, got ${vector.length}`);
    }
    this.#embeddings.set(id, { vector: [...vector], metadata, storedAt: Date.now() });
    this.metrics.stored++;
    return { id, dims: this.#dims, storedAt: Date.now() };
  }

  /**
   * Cosine similarity search over stored embeddings.
   * @returns {Array<{ id, similarity, metadata }>} sorted descending by similarity
   */
  search(queryVector, { topK = 5, minSimilarity = PHI_INV } = {}) {
    if (queryVector.length !== this.#dims) {
      throw new Error(`Query vector dimension mismatch: expected ${this.#dims}, got ${queryVector.length}`);
    }

    const results = [];
    for (const [id, entry] of this.#embeddings) {
      const sim = this.cosineSimilarity(queryVector, entry.vector);
      if (sim >= minSimilarity) {
        results.push({ id, similarity: Math.round(sim * 10000) / 10000, metadata: entry.metadata });
      }
    }

    this.metrics.searches++;
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
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

  /** Delete a stored embedding by id. */
  delete(id) {
    const existed = this.#embeddings.delete(id);
    if (existed) this.metrics.deletes++;
    return existed;
  }

  /** Aggregate storage statistics. */
  getStats() {
    let normSum = 0;
    for (const entry of this.#embeddings.values()) {
      const norm = Math.sqrt(entry.vector.reduce((s, v) => s + v * v, 0));
      normSum += norm;
    }
    const count = this.#embeddings.size;
    return {
      count,
      dims         : this.#dims,
      avgVectorNorm: count === 0 ? 0 : Math.round((normSum / count) * 10000) / 10000,
      ...this.metrics,
    };
  }

  /** Remove embeddings older than maxAgeMs milliseconds. */
  prune(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    let pruned   = 0;
    for (const [id, entry] of this.#embeddings) {
      if (entry.storedAt < cutoff) {
        this.#embeddings.delete(id);
        pruned++;
      }
    }
    this.metrics.prunes += pruned;
    return { pruned, remaining: this.#embeddings.size };
  }

  report() {
    return { version: this.version, domain: this.domain, stats: this.getStats() };
  }
}

export default VectorEmbeddingProtocol;
