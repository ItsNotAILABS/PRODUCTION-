/**
 * XPlatformConnector — base class for all X ecosystem platform adapters.
 * Subclasses implement _operations() to return a map of operation name → async function.
 */
export class XPlatformConnector {
  #name;
  #version;
  #capabilities;
  #connected;
  #credentials;

  /**
   * @param {{ name: string, version?: string, capabilities?: string[], credentials?: object }} opts
   */
  constructor({ name, version = '1.0.0', capabilities = [], credentials = {} }) {
    if (!name) throw new TypeError('Platform connector requires a name');
    this.#name         = name;
    this.#version      = version;
    this.#capabilities = [...capabilities];
    this.#credentials  = { ...credentials };
    this.#connected    = false;
  }

  get name()         { return this.#name; }
  get version()      { return this.#version; }
  get capabilities() { return [...this.#capabilities]; }
  get isConnected()  { return this.#connected; }

  /** @protected — subclasses read credentials to build auth headers. */
  get credentials()  { return { ...this.#credentials }; }

  /**
   * Establish connection. Subclasses override and call super.connect() on success.
   * @returns {Promise<void>}
   */
  async connect() {
    this.#connected = true;
  }

  /** @returns {Promise<void>} */
  async disconnect() {
    this.#connected = false;
  }

  /**
   * Execute a named operation.
   * @param {string} operation
   * @param {object} [params]
   * @returns {Promise<object>}
   */
  async execute(operation, params = {}) {
    const ops = this._operations();
    const fn  = ops[operation];
    if (!fn) {
      throw new Error(
        `${this.#name}: unknown operation "${operation}". ` +
        `Available: ${Object.keys(ops).join(', ')}`,
      );
    }
    return fn.call(this, params);
  }

  /**
   * Platform health probe.
   * @returns {Promise<{ status: string, latencyMs: number }>}
   */
  async health() {
    const t0 = Date.now();
    return { status: this.#connected ? 'healthy' : 'disconnected', latencyMs: Date.now() - t0 };
  }

  /**
   * Override in subclasses to declare supported operations.
   * @returns {Record<string, (params: object) => Promise<object>>}
   * @protected
   */
  _operations() { return {}; }

  /** Throw if the connector has not been connected. Used by operation implementations. @protected */
  _requireConnected() {
    if (!this.#connected) throw new Error(`${this.#name}: not connected. Call connect() first.`);
  }

  toJSON() {
    return {
      name:         this.#name,
      version:      this.#version,
      capabilities: this.#capabilities,
      connected:    this.#connected,
    };
  }
}

export default XPlatformConnector;
