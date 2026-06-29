/**
 * XProtocolRegistry — searchable, versioned protocol discovery for the X ecosystem.
 * Indexes protocols by domain, capability, and tags with O(1) lookups.
 */
export class XProtocolRegistry {
  #protocols    = new Map(); // id → descriptor
  #byDomain     = new Map(); // domain → Set<id>
  #byCapability = new Map(); // capability → Set<id>
  #byTag        = new Map(); // tag → Set<id>

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a single protocol descriptor.
   * @param {{
   *   id:            string,
   *   name:          string,
   *   version?:      string,
   *   domain?:       string,
   *   capabilities?: string[],
   *   tags?:         string[],
   *   description?:  string,
   *   inputTypes?:   string[],
   *   outputTypes?:  string[],
   *   meta?:         object,
   * }} descriptor
   * @returns {object} Stored entry
   */
  register(descriptor) {
    if (!descriptor.id)   throw new TypeError('Protocol descriptor requires id');
    if (!descriptor.name) throw new TypeError('Protocol descriptor requires name');

    const entry = {
      id:           descriptor.id,
      name:         descriptor.name,
      version:      descriptor.version      ?? '1.0.0',
      domain:       descriptor.domain       ?? 'general',
      capabilities: descriptor.capabilities ?? [],
      tags:         descriptor.tags         ?? [],
      description:  descriptor.description  ?? '',
      inputTypes:   descriptor.inputTypes   ?? [],
      outputTypes:  descriptor.outputTypes  ?? [],
      meta:         descriptor.meta         ?? {},
      registeredAt: new Date().toISOString(),
      health:       'healthy',
    };

    this.#protocols.set(entry.id, entry);
    this.#index(entry);
    return entry;
  }

  /** Bulk-register an array of descriptors. */
  registerAll(descriptors) {
    for (const d of descriptors) this.register(d);
    return this;
  }

  /** Remove a protocol from the registry. */
  unregister(id) {
    const entry = this.#protocols.get(id);
    if (!entry) return;
    this.#protocols.delete(id);
    this.#removeFromIndex(entry);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** @returns {object|null} */
  get(id) { return this.#protocols.get(id) ?? null; }

  /** @returns {object[]} All protocols */
  list() { return [...this.#protocols.values()]; }

  /** @returns {object[]} Protocols in a given domain */
  byDomain(domain) {
    return [...(this.#byDomain.get(domain) ?? [])].map((id) => this.#protocols.get(id)).filter(Boolean);
  }

  /** @returns {object[]} Protocols that advertise a given capability */
  byCapability(capability) {
    return [...(this.#byCapability.get(capability) ?? [])].map((id) => this.#protocols.get(id)).filter(Boolean);
  }

  /**
   * Fuzzy text search across id, name, description, tags, capabilities.
   * @param {string} term
   * @returns {object[]}
   */
  search(term) {
    const q = term.toLowerCase();
    return [...this.#protocols.values()].filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.capabilities.some((c) => c.toLowerCase().includes(q)),
    );
  }

  /**
   * Find protocols that accept a given input type (empty inputTypes = accepts all).
   * @param {string} inputType
   * @returns {object[]}
   */
  accepts(inputType) {
    return [...this.#protocols.values()].filter(
      (p) => p.inputTypes.length === 0 || p.inputTypes.includes(inputType),
    );
  }

  /**
   * Update health status of a registered protocol.
   * @param {string} id
   * @param {'healthy'|'degraded'|'unhealthy'} status
   */
  setHealth(id, status) {
    const entry = this.#protocols.get(id);
    if (entry) entry.health = status;
  }

  /**
   * Registry statistics.
   * @returns {{ total: number, byDomain: object, healthy: number, degraded: number, unhealthy: number }}
   */
  stats() {
    const all = [...this.#protocols.values()];
    const byDomain = {};
    for (const p of all) byDomain[p.domain] = (byDomain[p.domain] ?? 0) + 1;
    return {
      total:     all.length,
      byDomain,
      healthy:   all.filter((p) => p.health === 'healthy').length,
      degraded:  all.filter((p) => p.health === 'degraded').length,
      unhealthy: all.filter((p) => p.health === 'unhealthy').length,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #index(entry) {
    const addTo = (map, key, id) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(id);
    };
    addTo(this.#byDomain, entry.domain, entry.id);
    for (const cap of entry.capabilities) addTo(this.#byCapability, cap, entry.id);
    for (const tag of entry.tags)         addTo(this.#byTag, tag, entry.id);
  }

  #removeFromIndex(entry) {
    this.#byDomain.get(entry.domain)?.delete(entry.id);
    for (const cap of entry.capabilities) this.#byCapability.get(cap)?.delete(entry.id);
    for (const tag of entry.tags)         this.#byTag.get(tag)?.delete(entry.id);
  }
}

export default XProtocolRegistry;
