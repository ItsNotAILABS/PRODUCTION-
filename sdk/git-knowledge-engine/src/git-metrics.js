/**
 * GitMetrics — lightweight, zero-dependency observability layer.
 * Tracks counters, gauges, and timing histograms for the Git Knowledge Engine.
 * All metrics are scoped per engine instance and exported as plain JSON.
 */
export class GitMetrics {
  /** @type {Map<string, number>} name → count */
  #counters = new Map();

  /** @type {Map<string, number>} name → current value */
  #gauges = new Map();

  /**
   * timing samples: name → { count, totalMs, minMs, maxMs, p50, p95 }
   * Raw samples kept up to 1000 per name before being summarised.
   * @type {Map<string, number[]>}
   */
  #timingSamples = new Map();

  #startedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Counters
  // ---------------------------------------------------------------------------

  /**
   * Increment a counter by delta (default 1).
   * @param {string} name
   * @param {number} [delta=1]
   */
  increment(name, delta = 1) {
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + delta);
  }

  /**
   * Get the current value of a counter.
   * @param {string} name
   * @returns {number}
   */
  counter(name) {
    return this.#counters.get(name) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Gauges
  // ---------------------------------------------------------------------------

  /**
   * Set a gauge to an absolute value.
   * @param {string} name
   * @param {number} value
   */
  gauge(name, value) {
    this.#gauges.set(name, value);
  }

  /**
   * Get the current value of a gauge.
   * @param {string} name
   * @returns {number}
   */
  getGauge(name) {
    return this.#gauges.get(name) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Timing
  // ---------------------------------------------------------------------------

  /**
   * Record a timing observation in milliseconds.
   * @param {string} name
   * @param {number} ms
   */
  recordTiming(name, ms) {
    if (!this.#timingSamples.has(name)) this.#timingSamples.set(name, []);
    const samples = this.#timingSamples.get(name);
    samples.push(ms);
    if (samples.length > 1000) samples.shift(); // rolling window
  }

  /**
   * Time an async operation and record the result.
   * @template T
   * @param {string} name
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async time(name, fn) {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.recordTiming(name, Date.now() - t0);
    }
  }

  /**
   * Summary statistics for a timing metric.
   * @param {string} name
   * @returns {{ count: number, totalMs: number, avgMs: number, minMs: number, maxMs: number, p50Ms: number, p95Ms: number } | null}
   */
  timingSummary(name) {
    const samples = this.#timingSamples.get(name);
    if (!samples || samples.length === 0) return null;

    const sorted = [...samples].sort((a, b) => a - b);
    const count  = sorted.length;
    const total  = sorted.reduce((s, v) => s + v, 0);

    return {
      count,
      totalMs: total,
      avgMs:   parseFloat((total / count).toFixed(2)),
      minMs:   sorted[0],
      maxMs:   sorted[count - 1],
      p50Ms:   sorted[Math.floor(count * 0.50)] ?? 0,
      p95Ms:   sorted[Math.floor(count * 0.95)] ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * Export all metrics as a plain serialisable object.
   * @returns {object}
   */
  export() {
    const counters = Object.fromEntries(this.#counters);
    const gauges   = Object.fromEntries(this.#gauges);
    const timings  = {};
    for (const name of this.#timingSamples.keys()) {
      timings[name] = this.timingSummary(name);
    }
    return {
      startedAt: this.#startedAt,
      exportedAt: new Date().toISOString(),
      counters,
      gauges,
      timings,
    };
  }

  /** Reset all metrics to zero. */
  reset() {
    this.#counters.clear();
    this.#gauges.clear();
    this.#timingSamples.clear();
  }
}

export default GitMetrics;
