/**
 * PROTO-I032: Background Workflow Protocol (BWP)
 * Derives from: AetherAgent heartbeat pattern, IntegrationOrchestrationProtocol
 *
 * Formalizes long-running, zero-token background execution: workflows tick on a
 * local heartbeat (no LLM call per tick), run on day-of-week schedules, and chain
 * into "stack flows" — the substrate for recurring business operations that run
 * Monday through Sunday without consuming any model tokens.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;
const MS_PER_DAY = 86_400_000;

export const WORKFLOW_RECURRENCE = Object.freeze({
  ONCE:       'once',
  DAILY:      'daily',
  WEEKLY:     'weekly',
  CONTINUOUS: 'continuous', // every tick, no schedule gate
});

export class BackgroundWorkflowProtocol {
  #workflows = new Map(); // id -> { steps, recurrence, daysOfWeek, handler, nextRunAt, runs[], status }
  #chains    = new Map(); // chainId -> [workflowId, ...]
  #startedAt = Date.now();

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { ticks: 0, runs: 0, failures: 0, tokensConsumed: 0, totalRuntimeMs: 0 };
  }

  /**
   * Register a workflow. `handler` is plain local code — never an LLM call —
   * so each run costs runtime, not tokens.
   */
  registerWorkflow(id, { handler, recurrence = WORKFLOW_RECURRENCE.CONTINUOUS, daysOfWeek = [], intervalMs = null } = {}) {
    if (typeof handler !== 'function') throw new Error('registerWorkflow requires a handler function');
    this.#workflows.set(id, {
      handler,
      recurrence,
      daysOfWeek,        // 0=Sun..6=Sat, used when recurrence === WEEKLY
      intervalMs,         // used when recurrence === DAILY/CONTINUOUS as min gap
      nextRunAt: Date.now(),
      runs: [],
      status: 'idle',
    });
    return { id, recurrence, registeredAt: new Date().toISOString() };
  }

  /** Chain workflows into a stack flow — runs in sequence when chain ticks land. */
  chain(chainId, workflowIds) {
    for (const id of workflowIds) {
      if (!this.#workflows.has(id)) throw new Error(`Cannot chain unknown workflow "${id}"`);
    }
    this.#chains.set(chainId, workflowIds);
    return { chainId, length: workflowIds.length };
  }

  /** Advance the heartbeat. Call this on your own interval (e.g. 873ms AetherAgent tick). */
  async tick(now = Date.now()) {
    this.metrics.ticks++;
    const fired = [];
    for (const [id, wf] of this.#workflows) {
      if (!this.#isDue(wf, now)) continue;
      fired.push(await this.#runWorkflow(id, wf, now));
    }
    return { tickedAt: new Date(now).toISOString(), fired };
  }

  /** Run a chain explicitly (stack flow), in sequence, stopping on first failure. */
  async runChain(chainId) {
    const ids = this.#chains.get(chainId);
    if (!ids) throw new Error(`Unknown chain "${chainId}"`);
    const results = [];
    for (const id of ids) {
      const wf = this.#workflows.get(id);
      const result = await this.#runWorkflow(id, wf, Date.now());
      results.push(result);
      if (!result.ok) break;
    }
    return { chainId, results, allOk: results.every(r => r.ok) };
  }

  #isDue(wf, now) {
    if (now < wf.nextRunAt) return false;
    if (wf.recurrence === WORKFLOW_RECURRENCE.WEEKLY) {
      const day = new Date(now).getDay();
      return wf.daysOfWeek.includes(day);
    }
    return true;
  }

  async #runWorkflow(id, wf, now) {
    wf.status = 'running';
    const start = Date.now();
    let ok = true, error = null, output = null;
    try {
      output = await wf.handler();
    } catch (e) {
      ok = false; error = e.message;
      this.metrics.failures++;
    }
    const runtimeMs = Date.now() - start;
    this.metrics.runs++;
    this.metrics.totalRuntimeMs += runtimeMs;
    // tokensConsumed stays 0 by construction — handler is local code, not a model call.

    wf.runs.push({ at: new Date(start).toISOString(), runtimeMs, ok, error });
    if (wf.runs.length > 100) wf.runs.shift();
    wf.status = ok ? 'idle' : 'failed';
    wf.nextRunAt = this.#nextRunAt(wf, now, runtimeMs);

    return { id, ok, error, output, runtimeMs };
  }

  #nextRunAt(wf, now, runtimeMs) {
    switch (wf.recurrence) {
      case WORKFLOW_RECURRENCE.ONCE:       return Infinity;
      case WORKFLOW_RECURRENCE.DAILY:      return now + (wf.intervalMs || MS_PER_DAY);
      case WORKFLOW_RECURRENCE.WEEKLY:     return now + MS_PER_DAY; // re-check next day for next matching weekday
      case WORKFLOW_RECURRENCE.CONTINUOUS: return now + (wf.intervalMs || 0);
      default:                              return now;
    }
  }

  /** Phi-weighted health score: recent runs weighted more, failures penalized. */
  health(id) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Unknown workflow "${id}"`);
    if (wf.runs.length === 0) return { id, score: 1, status: wf.status, runs: 0 };

    let score = 0, weight = 0, w = 1;
    for (let i = wf.runs.length - 1; i >= 0; i--) {
      score  += (wf.runs[i].ok ? 1 : 0) * w;
      weight += w;
      w *= PHI_INV;
    }
    const uptimeMs = Date.now() - this.#startedAt;
    return {
      id,
      status: wf.status,
      score: parseFloat((score / weight).toFixed(4)),
      runs: wf.runs.length,
      lastRunAt: wf.runs[wf.runs.length - 1].at,
      uptimeMs,
      tokensConsumed: 0,
    };
  }

  statusAll() {
    return [...this.#workflows.keys()].map(id => this.health(id));
  }

  report() {
    return {
      version: this.version,
      domain: this.domain,
      metrics: this.metrics,
      workflows: this.#workflows.size,
      chains: this.#chains.size,
      uptimeMs: Date.now() - this.#startedAt,
      note: 'Background ticks execute local handlers only — zero tokens per run by design.',
    };
  }
}

export default BackgroundWorkflowProtocol;
