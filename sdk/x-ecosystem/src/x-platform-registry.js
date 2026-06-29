/**
 * XPlatformRegistry — manages platform adapters available in the X ecosystem.
 * Adapters are registered by name and resolved at mission dispatch time.
 */
export class XPlatformRegistry {
  #adapters = new Map(); // name → entry

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a platform adapter.
   * @param {string} name - e.g. 'square', 'shopify', 'stripe'
   * @param {object} adapter - Must implement execute(op, params). May implement health().
   * @param {{ capabilities?: string[], meta?: object }} [opts]
   */
  register(name, adapter, { capabilities = [], meta = {} } = {}) {
    if (!name)    throw new TypeError('Platform name is required');
    if (!adapter) throw new TypeError('Platform adapter is required');
    if (typeof adapter.execute !== 'function') {
      throw new TypeError(`Platform adapter "${name}" must implement execute(op, params)`);
    }
    this.#adapters.set(name, {
      name,
      adapter,
      capabilities,
      meta,
      registeredAt: new Date().toISOString(),
      status: 'registered',
    });
  }

  /** Remove a platform adapter. */
  unregister(name) { this.#adapters.delete(name); }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /**
   * Get an adapter by name. Throws if not registered.
   * @param {string} name
   * @returns {{ name: string, adapter: object, capabilities: string[], status: string }}
   */
  resolve(name) {
    const entry = this.#adapters.get(name);
    if (!entry) throw new Error(`XPlatformRegistry: platform "${name}" not registered`);
    return entry;
  }

  /** @returns {boolean} */
  has(name) { return this.#adapters.has(name); }

  /** @returns {object[]} All registered platforms (adapter omitted for safe serialization) */
  list() {
    return [...this.#adapters.values()].map(({ adapter: _, ...rest }) => rest);
  }

  /**
   * @param {string} capability
   * @returns {string[]} Platform names that advertise the capability
   */
  withCapability(capability) {
    return [...this.#adapters.entries()]
      .filter(([, e]) => e.capabilities.includes(capability))
      .map(([name]) => name);
  }

  /**
   * Run health probes across all registered platforms.
   * @returns {Promise<Array<{ name: string, status: string, latencyMs?: number, error?: string }>>}
   */
  async probeAll() {
    return Promise.all(
      [...this.#adapters.entries()].map(async ([name, entry]) => {
        if (typeof entry.adapter.health !== 'function') {
          return { name, status: 'unknown' };
        }
        const t0 = Date.now();
        try {
          await entry.adapter.health();
          entry.status = 'healthy';
          return { name, status: 'healthy', latencyMs: Date.now() - t0 };
        } catch (err) {
          entry.status = 'unhealthy';
          return { name, status: 'unhealthy', error: err.message, latencyMs: Date.now() - t0 };
        }
      }),
    );
  }
}

export default XPlatformRegistry;
