/**
 * PROTO-O003: Performance Optimization Protocol (POP)
 * Derives from: AdaptiveOptimizerProtocol, PredictiveCodingProtocol
 * Continuous performance profiling, bottleneck detection, and adaptive tuning.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const PERF_STATUS = Object.freeze({
  OPTIMAL:    'optimal',     // score > 0.85
  GOOD:       'good',        // 0.65 – 0.85
  DEGRADED:   'degraded',    // 0.4 – 0.65
  CRITICAL:   'critical',    // < 0.4
});

export class PerformanceOptimizationProtocol {
  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'operations';
    this.sampleWindow  = config.sampleWindow  ?? 60;    // seconds to retain samples
    this.targetP95Ms   = config.targetP95Ms   ?? 200;   // target p95 latency in ms
    this.targetCpuPct  = config.targetCpuPct  ?? 70;    // target CPU %
    this.targetMemPct  = config.targetMemPct  ?? 75;    // target memory %
    this.metrics       = { profiles: 0, bottlenecksDetected: 0, tuningsApplied: 0 };
    this.#samples      = [];
    this.#tuningLog    = [];
  }

  #samples;
  #tuningLog;

  /**
   * Record a performance sample.
   * @param {{ latencyMs: number, cpuPct: number, memPct: number, throughput: number, errorRate?: number, label?: string }} sample
   */
  record(sample) {
    const entry = { ...sample, ts: Date.now(), errorRate: sample.errorRate ?? 0 };
    this.#samples.push(entry);
    // evict samples outside window
    const cutoff = Date.now() - this.sampleWindow * 1_000;
    while (this.#samples.length > 0 && this.#samples[0].ts < cutoff) this.#samples.shift();
    this.metrics.profiles++;
  }

  /**
   * Compute current performance profile from recent samples.
   * @returns {{ status: string, score: number, p50: number, p95: number, cpuAvg: number, memAvg: number, throughputAvg: number, errorRate: number }}
   */
  profile() {
    if (this.#samples.length === 0) return { status: PERF_STATUS.OPTIMAL, score: 1, p50: 0, p95: 0, cpuAvg: 0, memAvg: 0, throughputAvg: 0, errorRate: 0 };

    const latencies  = this.#samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const p50        = this.#percentile(latencies, 50);
    const p95        = this.#percentile(latencies, 95);
    const cpuAvg     = this.#avg(this.#samples.map((s) => s.cpuPct));
    const memAvg     = this.#avg(this.#samples.map((s) => s.memPct));
    const throughput = this.#avg(this.#samples.map((s) => s.throughput));
    const errorRate  = this.#avg(this.#samples.map((s) => s.errorRate));

    // phi-weighted score: latency carries most weight
    const latScore   = Math.max(0, 1 - (p95 / this.targetP95Ms - 1) * PHI_INV);
    const cpuScore   = Math.max(0, 1 - Math.max(0, cpuAvg - this.targetCpuPct) / 30);
    const memScore   = Math.max(0, 1 - Math.max(0, memAvg - this.targetMemPct) / 25);
    const errScore   = Math.max(0, 1 - errorRate * 10);
    const score      = Math.min(1, (latScore * PHI + cpuScore + memScore + errScore * PHI_INV) / (PHI + 1 + 1 + PHI_INV));

    const status = score > 0.85 ? PERF_STATUS.OPTIMAL
      : score > 0.65 ? PERF_STATUS.GOOD
      : score > 0.40 ? PERF_STATUS.DEGRADED
      : PERF_STATUS.CRITICAL;

    return { status, score: Math.round(score * 1000) / 1000, p50: Math.round(p50), p95: Math.round(p95), cpuAvg: Math.round(cpuAvg * 10) / 10, memAvg: Math.round(memAvg * 10) / 10, throughputAvg: Math.round(throughput * 100) / 100, errorRate: Math.round(errorRate * 10000) / 10000 };
  }

  /**
   * Detect bottlenecks from the current profile.
   * @returns {{ bottleneck: string, severity: 'low'|'medium'|'high', recommendation: string }[]}
   */
  detectBottlenecks() {
    const p = this.profile();
    const found = [];

    if (p.p95 > this.targetP95Ms * PHI) {
      found.push({ bottleneck: 'high_latency', severity: 'high', recommendation: `p95 ${p.p95}ms exceeds threshold — investigate blocking I/O or N+1 queries` });
    } else if (p.p95 > this.targetP95Ms) {
      found.push({ bottleneck: 'elevated_latency', severity: 'medium', recommendation: `p95 ${p.p95}ms above target — profile hot paths` });
    }

    if (p.cpuAvg > this.targetCpuPct * PHI_INV + this.targetCpuPct) {
      found.push({ bottleneck: 'cpu_saturation', severity: 'high', recommendation: `CPU at ${p.cpuAvg}% — consider horizontal scaling or algorithm optimisation` });
    } else if (p.cpuAvg > this.targetCpuPct) {
      found.push({ bottleneck: 'cpu_pressure', severity: 'medium', recommendation: `CPU at ${p.cpuAvg}% — monitor for sustained increase` });
    }

    if (p.memAvg > this.targetMemPct + 15) {
      found.push({ bottleneck: 'memory_pressure', severity: 'high', recommendation: `Memory at ${p.memAvg}% — check for leaks or increase heap allocation` });
    }

    if (p.errorRate > 0.05) {
      found.push({ bottleneck: 'high_error_rate', severity: 'high', recommendation: `Error rate ${(p.errorRate * 100).toFixed(2)}% — triage upstream dependencies` });
    }

    this.metrics.bottlenecksDetected += found.length;
    return found;
  }

  /**
   * Suggest tuning parameters based on current profile.
   * @returns {{ param: string, currentValue: any, suggestedValue: any, rationale: string }[]}
   */
  suggestTuning() {
    const p           = this.profile();
    const suggestions = [];

    if (p.p95 > this.targetP95Ms) {
      const factor = Math.min(PHI, p.p95 / this.targetP95Ms);
      suggestions.push({ param: 'connectionPoolSize', currentValue: 10, suggestedValue: Math.ceil(10 * factor), rationale: 'Increase pool to reduce latency queue' });
    }

    if (p.cpuAvg > this.targetCpuPct) {
      suggestions.push({ param: 'workerConcurrency', currentValue: 4, suggestedValue: Math.max(2, Math.floor(4 * this.targetCpuPct / p.cpuAvg)), rationale: 'Reduce concurrency to relieve CPU' });
    }

    if (p.memAvg > this.targetMemPct) {
      suggestions.push({ param: 'cacheMaxItems', currentValue: 10_000, suggestedValue: Math.floor(10_000 * this.targetMemPct / p.memAvg), rationale: 'Shrink cache to reduce memory pressure' });
    }

    const entry = { ts: new Date().toISOString(), profile: p, suggestions };
    this.#tuningLog.push(entry);
    if (this.#tuningLog.length > 500) this.#tuningLog.shift();
    this.metrics.tuningsApplied += suggestions.length;

    return suggestions;
  }

  #avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a, v) => a + v, 0) / arr.length; }

  #percentile(sorted, pct) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default PerformanceOptimizationProtocol;
