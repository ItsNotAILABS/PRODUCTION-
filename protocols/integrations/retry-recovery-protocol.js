/**
 * PROTO-I011: Retry Recovery Protocol (RRP)
 * Derives from: HomeostaticDriveProtocol, AdaptiveOptimizerProtocol
 * Exponential backoff retry with phi-math timing, custom recovery handlers, and circuit breaker.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const CIRCUIT_STATE = Object.freeze({ CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' });

export class RetryRecoveryProtocol {
  #recoveries     = new Map(); // errorType → recoveryFn
  #consecutiveFail = 0;
  #circuitState   = CIRCUIT_STATE.CLOSED;
  #circuitOpenAt  = 0;

  constructor(config = {}) {
    this.version          = '1.0.0';
    this.domain           = 'integrations';
    this.breakerThreshold = config.breakerThreshold ?? 5;
    this.breakerResetMs   = config.breakerResetMs   ?? 30_000;
    this.metrics          = { attempts: 0, successes: 0, failures: 0, recovered: 0 };
  }

  /** Wrap an async function with phi-backoff retry logic. */
  async withRetry(fn, { maxRetries = 3, baseDelayMs = 200, maxDelayMs = 10_000, shouldRetry } = {}) {
    this.#checkCircuit();
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.metrics.attempts++;
      try {
        const result = await fn(attempt);
        this.metrics.successes++;
        this.#consecutiveFail = 0;
        if (this.#circuitState === CIRCUIT_STATE.HALF_OPEN) this.#circuitState = CIRCUIT_STATE.CLOSED;
        return result;
      } catch (err) {
        lastErr = err;
        this.metrics.failures++;
        this.#consecutiveFail++;
        if (this.#consecutiveFail >= this.breakerThreshold) this.#openCircuit();

        // Attempt recovery
        const recovered = await this.#tryRecover(err);
        if (recovered !== undefined) { this.metrics.recovered++; return recovered; }

        if (attempt === maxRetries) break;
        const retryable = typeof shouldRetry === 'function' ? shouldRetry(err, attempt) : true;
        if (!retryable) break;

        // phi-math delay: baseDelayMs * PHI^attempt, capped at maxDelayMs
        const delay = Math.min(maxDelayMs, Math.round(baseDelayMs * PHI ** attempt));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /** Register a custom recovery function for a specific error type/name. */
  registerRecovery(errorType, recoveryFn) {
    this.#recoveries.set(errorType, recoveryFn);
    return { errorType, registered: true };
  }

  /** Current circuit breaker state. */
  circuitStatus() {
    return {
      state:     this.#circuitState,
      openAt:    this.#circuitOpenAt || null,
      resetIn:   this.#circuitState === CIRCUIT_STATE.OPEN
                   ? Math.max(0, this.#circuitOpenAt + this.breakerResetMs - Date.now())
                   : 0,
    };
  }

  #checkCircuit() {
    if (this.#circuitState === CIRCUIT_STATE.OPEN) {
      const age = Date.now() - this.#circuitOpenAt;
      if (age > this.breakerResetMs) {
        this.#circuitState = CIRCUIT_STATE.HALF_OPEN;
      } else {
        throw new Error(`Circuit breaker OPEN — retry in ${Math.ceil((this.breakerResetMs - age) / 1000)}s`);
      }
    }
  }

  #openCircuit() {
    this.#circuitState  = CIRCUIT_STATE.OPEN;
    this.#circuitOpenAt = Date.now();
  }

  async #tryRecover(err) {
    const fn = this.#recoveries.get(err.constructor?.name) ?? this.#recoveries.get(err.message);
    if (!fn) return undefined;
    try { return await fn(err); } catch { return undefined; }
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default RetryRecoveryProtocol;
