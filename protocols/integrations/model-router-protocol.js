/**
 * PROTO-I023: Model Router Protocol (MRP)
 * Derives from: MCPGatewayProtocol, IntegrationOrchestrationProtocol
 * Route queries to the best AI model by capability, cost, and latency
 * using a phi-weighted composite score.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class ModelRouterProtocol {
  #models = new Map(); // id → { capabilities:[], costPerToken, latencyMs, callCount, errorCount }

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { routes: 0, errors: 0, totalLatencyMs: 0 };
  }

  /** Register an AI model with its capabilities, cost, and latency profile. */
  registerModel(id, { capabilities = [], costPerToken = 0.001, latencyMs = 500 } = {}) {
    this.#models.set(id, {
      capabilities : [...capabilities],
      costPerToken,
      latencyMs,
      callCount    : 0,
      errorCount   : 0,
    });
    return { id, capabilities, costPerToken, latencyMs };
  }

  /**
   * Route a query to the best model.
   * phi-score = capMatch * PHI_INV + (1 - normCost) * PHI_INV^2 + (1 - normLatency) * PHI_INV^3
   */
  route(query, { capability = null, maxCost = Infinity, maxLatency = Infinity } = {}) {
    if (this.#models.size === 0) throw new Error('No models registered');

    const eligible = [...this.#models.entries()].filter(([, m]) => {
      const meetsCapability = !capability || m.capabilities.includes(capability);
      return meetsCapability && m.costPerToken <= maxCost && m.latencyMs <= maxLatency;
    });

    if (eligible.length === 0) throw new Error('No model meets routing constraints');

    const maxCostVal    = Math.max(...eligible.map(([, m]) => m.costPerToken), 1e-9);
    const maxLatencyVal = Math.max(...eligible.map(([, m]) => m.latencyMs), 1);

    let bestId = null, bestScore = -Infinity;

    for (const [id, m] of eligible) {
      const capMatch    = capability ? (m.capabilities.includes(capability) ? 1 : 0) : 1;
      const normCost    = m.costPerToken / maxCostVal;
      const normLatency = m.latencyMs    / maxLatencyVal;

      const score = capMatch * PHI_INV
                  + (1 - normCost)    * PHI_INV ** 2
                  + (1 - normLatency) * PHI_INV ** 3;

      if (score > bestScore) { bestScore = score; bestId = id; }
    }

    this.metrics.routes++;
    return bestId;
  }

  /** Record the outcome of a model call to track reliability. */
  recordResult(id, { success = true, latencyMs = 0 } = {}) {
    const m = this.#models.get(id);
    if (!m) throw new Error(`Unknown model: ${id}`);
    m.callCount++;
    if (!success) m.errorCount++;
    this.metrics.totalLatencyMs += latencyMs;
    if (!success) this.metrics.errors++;
    return { id, callCount: m.callCount, errorCount: m.errorCount };
  }

  /** List all registered models with their computed phi-scores. */
  getModels() {
    if (this.#models.size === 0) return [];
    const maxCostVal    = Math.max(...[...this.#models.values()].map(m => m.costPerToken), 1e-9);
    const maxLatencyVal = Math.max(...[...this.#models.values()].map(m => m.latencyMs), 1);

    return [...this.#models.entries()].map(([id, m]) => {
      const normCost    = m.costPerToken / maxCostVal;
      const normLatency = m.latencyMs    / maxLatencyVal;
      const phiScore    = PHI_INV + (1 - normCost) * PHI_INV ** 2 + (1 - normLatency) * PHI_INV ** 3;
      const errorRate   = m.callCount === 0 ? 0 : m.errorCount / m.callCount;
      return { id, ...m, phiScore: Math.round(phiScore * 1000) / 1000, errorRate };
    });
  }

  /** Aggregate routing statistics. */
  getStats() {
    const totalCalls = [...this.#models.values()].reduce((s, m) => s + m.callCount, 0);
    const avgLatency = this.metrics.routes === 0
      ? 0
      : this.metrics.totalLatencyMs / this.metrics.routes;

    return {
      modelCount  : this.#models.size,
      totalCalls,
      avgLatencyMs: Math.round(avgLatency),
      ...this.metrics,
    };
  }

  report() {
    return { version: this.version, domain: this.domain, stats: this.getStats() };
  }
}

export default ModelRouterProtocol;
