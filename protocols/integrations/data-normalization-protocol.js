/**
 * PROTO-I003: Data Normalization Protocol (DNP)
 * Derives from: DataSchemaProtocol, CrossPlatformSyncProtocol
 * Normalizes data schemas across platforms using field maps; tracks coverage scores.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class DataNormalizationProtocol {
  #schemas  = new Map(); // platform → { toCanonical: Map, fromCanonical: Map }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.strict   = config.strict ?? false;
    this.metrics  = { schemas: 0, normalized: 0, denormalized: 0, coverageScore: 0 };
  }

  /** Register a field map for a platform. fieldMap: { platformField: canonicalField } */
  registerSchema(platform, fieldMap = {}) {
    const toCanonical   = new Map(Object.entries(fieldMap));
    const fromCanonical = new Map(Object.entries(fieldMap).map(([k, v]) => [v, k]));
    this.#schemas.set(platform, { toCanonical, fromCanonical });
    this.metrics.schemas++;
    this.#recalcCoverage();
    return { platform, fieldCount: toCanonical.size };
  }

  /** Normalize platform-specific data to canonical form. */
  normalize(platform, data) {
    const schema = this.#getSchema(platform);
    const result = Array.isArray(data)
      ? data.map((item) => this.#mapFields(item, schema.toCanonical))
      : this.#mapFields(data, schema.toCanonical);
    this.metrics.normalized++;
    return result;
  }

  /** Denormalize canonical data back to platform-specific form. */
  denormalize(platform, canonical) {
    const schema = this.#getSchema(platform);
    const result = Array.isArray(canonical)
      ? canonical.map((item) => this.#mapFields(item, schema.fromCanonical))
      : this.#mapFields(canonical, schema.fromCanonical);
    this.metrics.denormalized++;
    return result;
  }

  #mapFields(obj, fieldMap) {
    const out = {};
    for (const [key, value] of Object.entries(obj ?? {})) {
      const mapped = fieldMap.get(key) ?? (this.strict ? null : key);
      if (mapped !== null) out[mapped] = value;
    }
    return out;
  }

  #getSchema(platform) {
    const schema = this.#schemas.get(platform);
    if (!schema) throw new Error(`No schema registered for platform: ${platform}`);
    return schema;
  }

  #recalcCoverage() {
    const sizes = [...this.#schemas.values()].map((s) => s.toCanonical.size);
    if (!sizes.length) return;
    const avg  = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const max  = Math.max(...sizes);
    // phi-weighted: score = avg/max blended with phi ratio
    this.metrics.coverageScore = parseFloat((avg / (max || 1) * PHI_INV + PHI_INV * 0.5).toFixed(4));
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default DataNormalizationProtocol;
