/**
 * PROTO-O008: Knowledge Synthesis Protocol (KSP)
 * Derives from: AdaptiveKnowledgeAbsorptionProtocol, MemoryLineageProtocol
 * Cross-system knowledge ingestion, deduplication, indexing, and synthesis.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const KNOWLEDGE_TYPE = Object.freeze({
  FACT:       'fact',
  PATTERN:    'pattern',
  INFERENCE:  'inference',
  HYPOTHESIS: 'hypothesis',
  PROCEDURE:  'procedure',
});

export class KnowledgeSynthesisProtocol {
  constructor(config = {}) {
    this.version        = '1.0.0';
    this.domain         = 'operations';
    this.maxEntries     = config.maxEntries ?? 10_000;
    this.decayRate      = config.decayRate  ?? PHI_INV * 0.1;  // relevance decay per day
    this.metrics        = { ingested: 0, deduplicated: 0, synthesized: 0, queries: 0 };
    this.#entries       = new Map();  // id → knowledge entry
    this.#index         = new Map();  // tag → Set<id>
    this.#sourceMap     = new Map();  // source → Set<id>
  }

  #entries;
  #index;
  #sourceMap;

  /**
   * Ingest a knowledge item.
   * @param {{ id?: string, type: string, source: string, content: string, tags?: string[], confidence?: number, relatedIds?: string[] }} item
   * @returns {{ id: string, deduplicated: boolean }}
   */
  ingest(item) {
    const id = item.id ?? `know-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    // Dedup check by content fingerprint
    const fp = this.#fingerprint(item.content);
    for (const entry of this.#entries.values()) {
      if (entry.fp === fp) {
        // Reinforce confidence
        entry.confidence = Math.min(1, entry.confidence + 0.05);
        entry.reinforcedAt = new Date().toISOString();
        this.metrics.deduplicated++;
        return { id: entry.id, deduplicated: true };
      }
    }

    const entry = {
      id,
      type:         item.type ?? KNOWLEDGE_TYPE.FACT,
      source:       item.source,
      content:      item.content,
      tags:         item.tags ?? [],
      confidence:   Math.min(1, Math.max(0, item.confidence ?? 0.8)),
      relatedIds:   item.relatedIds ?? [],
      fp,
      createdAt:    new Date().toISOString(),
      accessCount:  0,
    };

    this.#entries.set(id, entry);
    this.#indexEntry(entry);

    if (this.#entries.size > this.maxEntries) this.#evictLowest();
    this.metrics.ingested++;
    return { id, deduplicated: false };
  }

  /**
   * Query the knowledge base.
   * @param {{ tags?: string[], source?: string, type?: string, minConfidence?: number, limit?: number }} filter
   * @returns {object[]}  Sorted by relevance score descending.
   */
  query({ tags = [], source, type, minConfidence = 0, limit = 50 } = {}) {
    this.metrics.queries++;
    let candidates = [...this.#entries.values()];

    if (source) candidates = candidates.filter((e) => e.source === source);
    if (type)   candidates = candidates.filter((e) => e.type   === type);
    candidates = candidates.filter((e) => e.confidence >= minConfidence);

    if (tags.length > 0) {
      candidates = candidates.filter((e) => tags.some((t) => e.tags.includes(t)));
    }

    const now = Date.now();
    const scored = candidates.map((e) => {
      const ageDays    = (now - new Date(e.createdAt).getTime()) / 86_400_000;
      const decayed    = e.confidence * Math.exp(-this.decayRate * ageDays);
      const tagBoost   = tags.length > 0 ? tags.filter((t) => e.tags.includes(t)).length / tags.length * PHI_INV : 0;
      const accessBoost = Math.log1p(e.accessCount) * 0.05 * PHI_INV;
      e.accessCount++;
      return { ...e, relevanceScore: Math.min(1, decayed + tagBoost + accessBoost) };
    });

    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  }

  /**
   * Synthesize a digest from multiple knowledge entries.
   * @param {string[]} ids
   * @returns {{ digest: string, confidence: number, sources: string[], themes: string[] }}
   */
  synthesize(ids) {
    const entries = ids.map((id) => this.#entries.get(id)).filter(Boolean);
    if (entries.length === 0) return { digest: '', confidence: 0, sources: [], themes: [] };

    const avgConf  = entries.reduce((a, e) => a + e.confidence, 0) / entries.length;
    const sources  = [...new Set(entries.map((e) => e.source))];
    const themes   = this.#extractThemes(entries);
    const digest   = entries.map((e) => `[${e.type.toUpperCase()}] ${e.content}`).join(' | ');

    this.metrics.synthesized++;
    return { digest, confidence: Math.round(avgConf * PHI_INV * 1000) / 1000, sources, themes };
  }

  /**
   * Get related knowledge entries via relatedIds graph traversal (1 hop).
   * @param {string} id
   * @returns {object[]}
   */
  related(id) {
    const entry = this.#entries.get(id);
    if (!entry) return [];
    return entry.relatedIds.map((rid) => this.#entries.get(rid)).filter(Boolean);
  }

  /**
   * Prune entries below a confidence threshold.
   * @param {number} [threshold=0.1]
   * @returns {number}  Number of pruned entries.
   */
  prune(threshold = 0.1) {
    let count = 0;
    for (const [id, entry] of this.#entries.entries()) {
      if (entry.confidence < threshold) {
        this.#entries.delete(id);
        this.#removeFromIndex(entry);
        count++;
      }
    }
    return count;
  }

  get size() { return this.#entries.size; }

  #fingerprint(content) {
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) { hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0; }
    return hash.toString(36);
  }

  #indexEntry(entry) {
    for (const tag of entry.tags) {
      if (!this.#index.has(tag)) this.#index.set(tag, new Set());
      this.#index.get(tag).add(entry.id);
    }
    if (!this.#sourceMap.has(entry.source)) this.#sourceMap.set(entry.source, new Set());
    this.#sourceMap.get(entry.source).add(entry.id);
  }

  #removeFromIndex(entry) {
    for (const tag of entry.tags) { this.#index.get(tag)?.delete(entry.id); }
    this.#sourceMap.get(entry.source)?.delete(entry.id);
  }

  #evictLowest() {
    let lowest = null;
    for (const entry of this.#entries.values()) {
      if (!lowest || entry.confidence < lowest.confidence) lowest = entry;
    }
    if (lowest) { this.#entries.delete(lowest.id); this.#removeFromIndex(lowest); }
  }

  #extractThemes(entries) {
    const tagCounts = new Map();
    for (const e of entries) {
      for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    return [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default KnowledgeSynthesisProtocol;
