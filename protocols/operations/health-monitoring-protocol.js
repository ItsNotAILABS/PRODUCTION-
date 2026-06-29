/**
 * PROTO-O001: Health Monitoring Protocol (HMP)
 * Derives from: VitalityHomeostasisProtocol, MiniHeartProtocol
 * Continuous system health tracking with phi-resonance scoring and degradation detection.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT = 873;  // ms — base pulse interval

export const HEALTH_STATUS = Object.freeze({
  HEALTHY:   'healthy',    // score > 0.8
  DEGRADED:  'degraded',   // 0.5 – 0.8
  CRITICAL:  'critical',   // 0.2 – 0.5
  DEAD:      'dead',       // < 0.2
});

export class HealthMonitoringProtocol {
  constructor(config = {}) {
    this.version     = '1.0.0';
    this.domain      = 'operations';
    this.pulseMs     = config.pulseMs ?? HEARTBEAT;
    this.history     = [];
    this.maxHistory  = config.maxHistory ?? 1000;
    this.metrics     = { pulses: 0, degradations: 0, recoveries: 0, criticals: 0 };
    this.#checks     = new Map();
    this.#prevStatus = null;
  }

  #checks;
  #prevStatus;

  /**
   * Register a health check.
   * @param {string} name
   * @param {() => Promise<{ ok: boolean, value?: number, message?: string }>} fn
   * @param {{ critical?: boolean, weight?: number }} opts
   */
  registerCheck(name, fn, { critical = false, weight = 1 } = {}) {
    this.#checks.set(name, { fn, critical, weight });
  }

  /**
   * Run all registered checks and compute a health pulse.
   * @returns {Promise<{ status: string, score: number, checks: object, timestamp: string }>}
   */
  async pulse() {
    const results  = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [name, { fn, critical, weight }] of this.#checks.entries()) {
      try {
        const r = await fn();
        results[name] = { ok: r.ok, value: r.value, message: r.message, critical };
        weightedSum += (r.ok ? 1 : 0) * weight * (critical ? PHI : 1);
        totalWeight += weight * (critical ? PHI : 1);
      } catch (err) {
        results[name] = { ok: false, message: err.message, critical };
        totalWeight   += weight * (critical ? PHI : 1);
      }
    }

    const score  = totalWeight > 0 ? weightedSum / totalWeight : 1;
    const status = score > 0.8 ? HEALTH_STATUS.HEALTHY
      : score > 0.5 ? HEALTH_STATUS.DEGRADED
      : score > 0.2 ? HEALTH_STATUS.CRITICAL
      : HEALTH_STATUS.DEAD;

    const entry = { status, score: Math.round(score * 1000) / 1000, checks: results, timestamp: new Date().toISOString() };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();

    this.metrics.pulses++;
    if (status === HEALTH_STATUS.CRITICAL || status === HEALTH_STATUS.DEAD) this.metrics.criticals++;
    if (this.#prevStatus === HEALTH_STATUS.HEALTHY && status !== HEALTH_STATUS.HEALTHY) this.metrics.degradations++;
    if (this.#prevStatus && this.#prevStatus !== HEALTH_STATUS.HEALTHY && status === HEALTH_STATUS.HEALTHY) this.metrics.recoveries++;
    this.#prevStatus = status;

    return entry;
  }

  /**
   * Trend analysis over recent N pulses.
   * @param {number} [n=10]
   * @returns {{ trend: 'improving'|'stable'|'declining', avgScore: number }}
   */
  trend(n = 10) {
    const recent = this.history.slice(-n);
    if (recent.length < 2) return { trend: 'stable', avgScore: recent[0]?.score ?? 1 };
    const avg  = recent.reduce((a, h) => a + h.score, 0) / recent.length;
    const first = recent[0].score;
    const last  = recent[recent.length - 1].score;
    const diff  = last - first;
    const trend = diff > 0.05 ? 'improving' : diff < -0.05 ? 'declining' : 'stable';
    return { trend, avgScore: Math.round(avg * 1000) / 1000 };
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default HealthMonitoringProtocol;
