/**
 * PROTO-I002: Integration Orchestration Protocol (IOP)
 * Derives from: AlphaOrchestratorProtocol, GoalStackProtocol
 * Orchestrates multi-step cross-platform workflows with dependency resolution and phi-weighted step priority.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const WORKFLOW_STATUS = Object.freeze({ PENDING: 'pending', RUNNING: 'running', DONE: 'done', FAILED: 'failed' });

export class IntegrationOrchestrationProtocol {
  #workflows = new Map(); // id → { steps[], status, results }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.maxSteps = config.maxSteps ?? 50;
    this.metrics  = { defined: 0, executed: 0, stepsDone: 0, failed: 0 };
  }

  /** Define a workflow with ordered/dependent steps. */
  defineWorkflow(id, steps = []) {
    if (steps.length > this.maxSteps) throw new Error(`Workflow exceeds maxSteps (${this.maxSteps})`);
    this.#workflows.set(id, { steps, status: WORKFLOW_STATUS.PENDING, results: {} });
    this.metrics.defined++;
    return { workflowId: id, stepCount: steps.length };
  }

  /** Execute a workflow, respecting dependsOn relationships. */
  async executeWorkflow(id, context = {}) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Workflow not found: ${id}`);
    wf.status = WORKFLOW_STATUS.RUNNING;
    const t0 = Date.now();

    try {
      const ordered = this.#topoSort(wf.steps);
      for (const step of ordered) {
        const stepCtx = { ...context, results: wf.results };
        const priority = this.#phiPriority(step, ordered);
        const result   = await this.#runStep(step, stepCtx, priority);
        wf.results[step.id ?? step.operation] = result;
        this.metrics.stepsDone++;
      }
      wf.status = WORKFLOW_STATUS.DONE;
      this.metrics.executed++;
      return { workflowId: id, steps: wf.results, duration: Date.now() - t0, success: true };
    } catch (err) {
      wf.status = WORKFLOW_STATUS.FAILED;
      this.metrics.failed++;
      return { workflowId: id, steps: wf.results, duration: Date.now() - t0, success: false, error: err.message };
    }
  }

  #topoSort(steps) {
    const map   = new Map(steps.map((s) => [s.id ?? s.operation, s]));
    const done  = new Set();
    const out   = [];
    const visit = (s) => {
      const key = s.id ?? s.operation;
      if (done.has(key)) return;
      for (const dep of s.dependsOn ?? []) { if (map.has(dep)) visit(map.get(dep)); }
      done.add(key);
      out.push(s);
    };
    steps.forEach(visit);
    return out;
  }

  #phiPriority(step, allSteps) {
    const idx = allSteps.indexOf(step);
    return 1 / (1 + idx * PHI_INV);
  }

  async #runStep(step, ctx, priority) {
    if (typeof step.fn === 'function') return step.fn(ctx, priority);
    return { platform: step.platform, operation: step.operation, priority, params: step.params };
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default IntegrationOrchestrationProtocol;
