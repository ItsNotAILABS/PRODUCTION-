/**
 * PROTO-O004: Deployment Orchestration Protocol (DOP)
 * Derives from: SwarmIntelligenceProtocol, AdaptiveKnowledgeAbsorptionProtocol
 * Canary deployments, blue/green routing, rollback logic, and release gating.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const DEPLOY_STATUS = Object.freeze({
  PENDING:    'pending',
  IN_PROGRESS: 'in_progress',
  CANARY:     'canary',
  STABLE:     'stable',
  ROLLED_BACK: 'rolled_back',
  FAILED:     'failed',
});

export const DEPLOY_STRATEGY = Object.freeze({
  CANARY:      'canary',
  BLUE_GREEN:  'blue_green',
  ROLLING:     'rolling',
  IMMEDIATE:   'immediate',
});

export class DeploymentOrchestrationProtocol {
  constructor(config = {}) {
    this.version         = '1.0.0';
    this.domain          = 'operations';
    this.canaryThreshold = config.canaryThreshold ?? PHI_INV;  // 62% success rate required to promote
    this.rollbackOnError = config.rollbackOnError ?? true;
    this.metrics         = { deploymentsStarted: 0, promoted: 0, rolledBack: 0, gates: 0 };
    this.#deployments    = new Map();
    this.#gates          = [];
  }

  #deployments;
  #gates;

  /**
   * Register a release gate (predicate that must pass before promotion).
   * @param {{ name: string, check: (deployment: object) => Promise<{ pass: boolean, reason?: string }> }} gate
   */
  registerGate(gate) {
    this.#gates.push(gate);
  }

  /**
   * Initiate a deployment.
   * @param {{ id: string, service: string, version: string, strategy?: string, env?: string, metadata?: object }} opts
   * @returns {{ deploymentId: string, status: string }}
   */
  initiate({ id, service, version, strategy = DEPLOY_STRATEGY.CANARY, env = 'production', metadata = {} }) {
    const dep = {
      id,
      service,
      version,
      strategy,
      env,
      metadata,
      status:     DEPLOY_STATUS.PENDING,
      startedAt:  new Date().toISOString(),
      canaryPct:  0,
      events:     [],
      gateResults: [],
    };
    this.#deployments.set(id, dep);
    this.metrics.deploymentsStarted++;
    this.#addEvent(dep, 'initiated', `Strategy: ${strategy}`);
    return { deploymentId: id, status: dep.status };
  }

  /**
   * Advance a canary deployment by updating traffic percentage.
   * @param {string} deploymentId
   * @param {number} trafficPct  0–100
   * @returns {{ deploymentId: string, canaryPct: number, status: string }}
   */
  advanceCanary(deploymentId, trafficPct) {
    const dep = this.#getDep(deploymentId);
    dep.canaryPct = Math.min(100, Math.max(0, trafficPct));
    dep.status    = DEPLOY_STATUS.CANARY;
    this.#addEvent(dep, 'canary_advanced', `Traffic: ${dep.canaryPct}%`);
    return { deploymentId, canaryPct: dep.canaryPct, status: dep.status };
  }

  /**
   * Record a health sample for a running deployment.
   * @param {string} deploymentId
   * @param {{ successRate: number, errorRate: number, p95Ms: number }} sample
   */
  recordHealth(deploymentId, sample) {
    const dep = this.#getDep(deploymentId);
    if (!dep.healthSamples) dep.healthSamples = [];
    dep.healthSamples.push({ ...sample, ts: Date.now() });
    if (dep.healthSamples.length > 100) dep.healthSamples.shift();
  }

  /**
   * Run release gates and promote or rollback a deployment.
   * @param {string} deploymentId
   * @returns {Promise<{ promoted: boolean, rolledBack: boolean, gateResults: object[], reason?: string }>}
   */
  async evaluate(deploymentId) {
    const dep = this.#getDep(deploymentId);
    this.metrics.gates++;

    // Run all gates
    const gateResults = [];
    for (const gate of this.#gates) {
      try {
        const r = await gate.check(dep);
        gateResults.push({ gate: gate.name, pass: r.pass, reason: r.reason });
        if (!r.pass) {
          dep.gateResults.push(...gateResults);
          if (this.rollbackOnError) return this.#rollback(dep, `Gate failed: ${gate.name} — ${r.reason}`);
          return { promoted: false, rolledBack: false, gateResults, reason: `Gate failed: ${gate.name}` };
        }
      } catch (err) {
        gateResults.push({ gate: gate.name, pass: false, reason: err.message });
        dep.gateResults.push(...gateResults);
        if (this.rollbackOnError) return this.#rollback(dep, `Gate error: ${gate.name}`);
        return { promoted: false, rolledBack: false, gateResults, reason: `Gate error: ${gate.name}` };
      }
    }

    // Health check on canary samples
    if (dep.healthSamples?.length > 0) {
      const avgSuccess = dep.healthSamples.reduce((a, s) => a + s.successRate, 0) / dep.healthSamples.length;
      if (avgSuccess < this.canaryThreshold) {
        dep.gateResults.push(...gateResults);
        return this.#rollback(dep, `Canary success rate ${(avgSuccess * 100).toFixed(1)}% below threshold`);
      }
    }

    dep.gateResults.push(...gateResults);
    dep.status    = DEPLOY_STATUS.STABLE;
    dep.promotedAt = new Date().toISOString();
    this.#addEvent(dep, 'promoted', `All ${gateResults.length} gates passed`);
    this.metrics.promoted++;
    return { promoted: true, rolledBack: false, gateResults };
  }

  /**
   * Compute a phi-weighted risk score for a deployment (lower = safer).
   * @param {string} deploymentId
   * @returns {number} 0–1
   */
  riskScore(deploymentId) {
    const dep = this.#getDep(deploymentId);
    const eventCount  = dep.events.length;
    const gateFailures = dep.gateResults.filter((g) => !g.pass).length;
    const canaryRisk  = dep.canaryPct > 0 ? dep.canaryPct / 100 * PHI_INV : 0;
    const gatePenalty = gateFailures * 0.2 * PHI;
    return Math.min(1, canaryRisk + gatePenalty + (eventCount > 10 ? 0.1 : 0));
  }

  get(deploymentId) { return this.#getDep(deploymentId); }

  list(env) {
    const all = [...this.#deployments.values()];
    return env ? all.filter((d) => d.env === env) : all;
  }

  #rollback(dep, reason) {
    dep.status      = DEPLOY_STATUS.ROLLED_BACK;
    dep.rolledBackAt = new Date().toISOString();
    this.#addEvent(dep, 'rolled_back', reason);
    this.metrics.rolledBack++;
    return { promoted: false, rolledBack: true, gateResults: dep.gateResults, reason };
  }

  #addEvent(dep, type, detail) {
    dep.events.push({ type, detail, ts: new Date().toISOString() });
  }

  #getDep(id) {
    const dep = this.#deployments.get(id);
    if (!dep) throw new Error(`Deployment not found: ${id}`);
    return dep;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default DeploymentOrchestrationProtocol;
