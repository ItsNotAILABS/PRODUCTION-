/**
 * Adaptive Configuration System
 *
 * Self-tuning configuration layer for the X ecosystem. Observes performance
 * metrics and adjusts operational parameters using phi-weighted feedback:
 * parameters converge toward optimal values without manual tuning.
 *
 * Design: Each configurable parameter has a phi-weighted update rule. On each
 * observation, the parameter moves PHI_INV fraction of the distance toward the
 * observed optimal — fast enough to respond to changes, slow enough to avoid
 * oscillation.
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873;

// Parameter adaptation strategies
export const ADAPT_STRATEGY = Object.freeze({
  PHI_GRADIENT:   'phi_gradient',    // Move PHI_INV fraction toward observed optimum
  FIBONACCI_STEP: 'fibonacci_step',  // Adjust by next Fibonacci step
  THRESHOLD_GATE: 'threshold_gate',  // Binary: below/above PHI_INV threshold
  EXPONENTIAL:    'exponential',     // Exponential moving average with phi decay
});

export class AdaptiveConfig {
  #params;       // Map<key, ParamEntry>
  #history;      // Map<key, Observation[]>
  #maxHistory;
  #observers;    // Map<key, Function[]>

  /**
   * @param {{ maxHistory?: number }} opts
   */
  constructor({ maxHistory = 100 } = {}) {
    this.#params    = new Map();
    this.#history   = new Map();
    this.#maxHistory = maxHistory;
    this.#observers  = new Map();
  }

  // ─── Parameter registration ─────────────────────────────────────────────────

  /**
   * Register a configurable parameter.
   * @param {{
   *   key: string,
   *   initialValue: number,
   *   min: number,
   *   max: number,
   *   strategy?: string,
   *   description?: string,
   * }} opts
   */
  register({ key, initialValue, min, max, strategy = ADAPT_STRATEGY.PHI_GRADIENT, description = '' }) {
    if (!key) throw new TypeError('AdaptiveConfig: key required');
    if (min >= max) throw new RangeError('AdaptiveConfig: min must be < max');

    this.#params.set(key, {
      value:      Math.max(min, Math.min(max, initialValue)),
      min,
      max,
      strategy,
      description,
      updateCount: 0,
      ema:        initialValue, // exponential moving average
    });
    this.#history.set(key, []);
    return this;
  }

  // ─── Parameter access ───────────────────────────────────────────────────────

  get(key) {
    const entry = this.#params.get(key);
    if (!entry) throw new Error(`AdaptiveConfig: unknown parameter "${key}"`);
    return entry.value;
  }

  getAll() {
    const result = {};
    for (const [key, entry] of this.#params) {
      result[key] = {
        value:       entry.value,
        min:         entry.min,
        max:         entry.max,
        strategy:    entry.strategy,
        updateCount: entry.updateCount,
        description: entry.description,
      };
    }
    return result;
  }

  // ─── Observation and adaptation ────────────────────────────────────────────

  /**
   * Observe a performance metric for a parameter and adapt the parameter value.
   * @param {string} key
   * @param {{ observed: number, target: number, metric?: string }} observation
   */
  observe(key, { observed, target, metric = 'value' }) {
    const entry = this.#params.get(key);
    if (!entry) throw new Error(`AdaptiveConfig: unknown parameter "${key}"`);

    const prev = entry.value;
    const history = this.#history.get(key);
    history.push({ observed, target, metric, at: Date.now(), prev });
    if (history.length > this.#maxHistory) history.shift();

    let next;
    switch (entry.strategy) {
      case ADAPT_STRATEGY.PHI_GRADIENT:
        // Move PHI_INV fraction toward the observed optimal direction
        next = prev + (observed - prev) * PHI_INV;
        break;

      case ADAPT_STRATEGY.FIBONACCI_STEP: {
        // Adjust by the next Fibonacci number × sign of (target - observed)
        const step = this.#fibStep(entry.updateCount) * (target > observed ? 1 : -1);
        next = prev + step * (entry.max - entry.min) / 100;
        break;
      }

      case ADAPT_STRATEGY.THRESHOLD_GATE:
        // Binary: if observed < PHI_INV of target, increase; else decrease
        next = observed < target * PHI_INV ? prev * PHI : prev * PHI_INV;
        break;

      case ADAPT_STRATEGY.EXPONENTIAL:
        // EMA update: new_ema = observed × PHI_INV + old_ema × (1 - PHI_INV)
        entry.ema = observed * PHI_INV + entry.ema * (1 - PHI_INV);
        next = entry.ema;
        break;

      default:
        next = prev;
    }

    next = Math.max(entry.min, Math.min(entry.max, next));
    entry.value      = next;
    entry.updateCount++;

    // Notify observers if value changed significantly (> 0.1% change)
    if (Math.abs(next - prev) / (entry.max - entry.min) > 0.001) {
      const fns = this.#observers.get(key) || [];
      for (const fn of fns) fn({ key, prev, next, observed, target });
    }

    return { key, prev, next, delta: next - prev };
  }

  /**
   * Observe a batch of metrics and adapt multiple parameters simultaneously.
   * @param {Array<{ key: string, observed: number, target: number }>} observations
   */
  observeBatch(observations) {
    return observations.map(obs => this.observe(obs.key, obs));
  }

  // ─── Change observation ─────────────────────────────────────────────────────

  /** Register a callback for when a parameter changes. */
  onChange(key, callback) {
    if (!this.#observers.has(key)) this.#observers.set(key, []);
    this.#observers.get(key).push(callback);
    return this;
  }

  // ─── History and analytics ─────────────────────────────────────────────────

  getHistory(key) {
    const history = this.#history.get(key);
    if (!history) throw new Error(`AdaptiveConfig: unknown parameter "${key}"`);
    return [...history];
  }

  /**
   * Compute phi-weighted convergence score for a parameter.
   * Score 1.0 means parameter has converged to a stable value.
   * Score 0.0 means parameter is still oscillating significantly.
   */
  getConvergence(key) {
    const history = this.#history.get(key);
    if (!history || history.length < 2) return 0;

    const recentDeltas = history.slice(-10).map((h, i, arr) => {
      if (!i) return 0;
      return Math.abs(h.prev - arr[i - 1].prev);
    }).slice(1);

    if (!recentDeltas.length) return 0;

    const entry = this.#params.get(key);
    const range = entry.max - entry.min;
    const avgDelta = recentDeltas.reduce((s, d) => s + d, 0) / recentDeltas.length;
    const relDelta = avgDelta / (range || 1);

    // Convergence score: 1 when relDelta = 0, 0 when relDelta = PHI_INV
    return Math.max(0, 1 - relDelta / PHI_INV);
  }

  /**
   * Get adaptation summary across all parameters.
   */
  summary() {
    const result = {};
    for (const [key] of this.#params) {
      result[key] = {
        value:       this.get(key),
        convergence: this.getConvergence(key),
        observations: (this.#history.get(key) || []).length,
      };
    }
    return result;
  }

  // ─── Presets for X ecosystem parameters ────────────────────────────────────

  /**
   * Register the standard X ecosystem adaptive parameters.
   * Call this to enable self-tuning for the full ecosystem.
   */
  registerXEcosystemDefaults() {
    this
      .register({
        key:          'heartbeatMs',
        initialValue: HEARTBEAT_MS,
        min:          500,
        max:          2000,
        strategy:     ADAPT_STRATEGY.PHI_GRADIENT,
        description:  'Organism heartbeat interval',
      })
      .register({
        key:          'rateLimitBurstMultiplier',
        initialValue: PHI,
        min:          1.0,
        max:          PHI ** 2,
        strategy:     ADAPT_STRATEGY.EXPONENTIAL,
        description:  'Burst multiplier for rate limiting (default: PHI)',
      })
      .register({
        key:          'retryBaseDelayMs',
        initialValue: 200,
        min:          50,
        max:          2000,
        strategy:     ADAPT_STRATEGY.FIBONACCI_STEP,
        description:  'Base delay for phi-exponential retry backoff',
      })
      .register({
        key:          'priorityDecayRate',
        initialValue: PHI_INV,
        min:          0.1,
        max:          0.99,
        strategy:     ADAPT_STRATEGY.THRESHOLD_GATE,
        description:  'Task priority decay rate per period (default: PHI_INV)',
      })
      .register({
        key:          'mcpLoadBalanceWeight',
        initialValue: PHI_INV,
        min:          0.1,
        max:          1.0,
        strategy:     ADAPT_STRATEGY.PHI_GRADIENT,
        description:  'Phi weight for MCP gateway load balancing',
      })
      .register({
        key:          'federationGossipIntervalMs',
        initialValue: HEARTBEAT_MS * PHI,
        min:          HEARTBEAT_MS,
        max:          HEARTBEAT_MS * PHI ** 3,
        strategy:     ADAPT_STRATEGY.EXPONENTIAL,
        description:  'Federation gossip interval (default: HEARTBEAT × PHI)',
      })
      .register({
        key:          'confidenceDecayRate',
        initialValue: PHI_INV,
        min:          0.1,
        max:          0.99,
        strategy:     ADAPT_STRATEGY.PHI_GRADIENT,
        description:  'Knowledge confidence decay rate per hour (default: PHI_INV)',
      });

    return this;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  #fibStep(n) {
    // Return nth Fibonacci number for Fibonacci step strategy
    let a = 1, b = 1;
    for (let i = 2; i <= Math.min(n % 20, 15); i++) { [a, b] = [b, a + b]; }
    return b;
  }
}

export const ADAPTIVE_CONFIG_VERSION = '1.0.0';
export default AdaptiveConfig;
