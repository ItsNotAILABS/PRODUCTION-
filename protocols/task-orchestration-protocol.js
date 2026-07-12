/**
 * PROTO-WORK-001: Task Orchestration Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * DAG-based task orchestration for the organism's work engine.
 * Tasks are nodes; dependencies are edges. The scheduler walks the
 * DAG topologically, respects phi-decay priority, and routes each
 * task to the best available agent via the federation mesh.
 *
 * Task lifecycle:
 *   PENDING → QUEUED → RUNNING → SUCCEEDED | FAILED → (retry → QUEUED)
 *
 * Phi-scoring: tasks with higher phi-score get scheduled first.
 * Failed tasks decay their phi-score; retries use the decayed score.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const STATUS = Object.freeze({
  PENDING:   'pending',
  QUEUED:    'queued',
  RUNNING:   'running',
  SUCCEEDED: 'succeeded',
  FAILED:    'failed',
  BLOCKED:   'blocked',   // waiting on dependencies
  CANCELLED: 'cancelled',
});

let _nextId = 1;
function newId(prefix = 'task') { return `${prefix}-${_nextId++}-${Date.now().toString(36)}`; }

class Task {
  constructor({ id, name, type, payload = {}, deps = [], priority = 1.0, maxRetries = 2, assignee = null }) {
    this.id        = id || newId();
    this.name      = name || this.id;
    this.type      = type || 'generic';
    this.payload   = payload;
    this.deps      = deps;        // Task ids this depends on
    this.priority  = priority;
    this.phiScore  = Math.pow(PHI, priority - 1);
    this.maxRetries= maxRetries;
    this.retries   = 0;
    this.assignee  = assignee;
    this.status    = STATUS.PENDING;
    this.result    = null;
    this.error     = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt   = null;
  }

  duration() {
    if (!this.startedAt) return 0;
    return (this.endedAt || Date.now()) - this.startedAt;
  }

  toDict() {
    return {
      id: this.id, name: this.name, type: this.type,
      status: this.status, priority: this.priority,
      phiScore: this.phiScore.toFixed(4), deps: this.deps,
      assignee: this.assignee, retries: this.retries,
      duration: this.duration(),
    };
  }
}

class TaskDAG {
  constructor() {
    this.tasks  = new Map();   // id → Task
    this._beat  = 0;
    this._done  = 0;
    this._failed = 0;
  }

  add(taskDef) {
    const t = new Task(taskDef);
    this.tasks.set(t.id, t);
    return t;
  }

  get(id) { return this.tasks.get(id); }

  /** Tasks whose deps are all SUCCEEDED — ready to run. */
  readyQueue() {
    const ready = [];
    for (const t of this.tasks.values()) {
      if (t.status !== STATUS.PENDING) continue;
      const allDone = t.deps.every(dep => {
        const d = this.tasks.get(dep);
        return d && d.status === STATUS.SUCCEEDED;
      });
      if (allDone) {
        t.status = STATUS.QUEUED;
        ready.push(t);
      }
    }
    // phi-score descending
    ready.sort((a, b) => b.phiScore - a.phiScore);
    return ready;
  }

  markRunning(id, assignee) {
    const t = this.tasks.get(id);
    if (!t) return false;
    t.status    = STATUS.RUNNING;
    t.assignee  = assignee;
    t.startedAt = Date.now();
    return true;
  }

  markDone(id, result) {
    const t = this.tasks.get(id);
    if (!t) return false;
    t.status   = STATUS.SUCCEEDED;
    t.result   = result;
    t.endedAt  = Date.now();
    t.phiScore = Math.min(PHI, t.phiScore * PHI);
    this._done++;
    return true;
  }

  markFailed(id, error) {
    const t = this.tasks.get(id);
    if (!t) return false;
    t.phiScore = Math.max(0.01, t.phiScore * PHI_INV);
    t.error    = error;
    t.endedAt  = Date.now();
    if (t.retries < t.maxRetries) {
      t.retries++;
      t.status = STATUS.PENDING;   // retry
      t.startedAt = null;
    } else {
      t.status = STATUS.FAILED;
      this._failed++;
    }
    return true;
  }

  cancel(id) {
    const t = this.tasks.get(id);
    if (t) t.status = STATUS.CANCELLED;
  }

  /** Cancel all tasks that depend (transitively) on a failed task. */
  propagateCancellation(failedId) {
    const cancelled = [];
    for (const t of this.tasks.values()) {
      if (t.deps.includes(failedId) && t.status === STATUS.PENDING) {
        t.status = STATUS.CANCELLED;
        cancelled.push(t.id);
      }
    }
    return cancelled;
  }

  isComplete() {
    return Array.from(this.tasks.values()).every(
      t => [STATUS.SUCCEEDED, STATUS.FAILED, STATUS.CANCELLED].includes(t.status)
    );
  }

  pulse() {
    this._beat++;
    return {
      beat:    this._beat,
      total:   this.tasks.size,
      done:    this._done,
      failed:  this._failed,
      running: Array.from(this.tasks.values()).filter(t => t.status === STATUS.RUNNING).length,
      pending: Array.from(this.tasks.values()).filter(t => t.status === STATUS.PENDING).length,
    };
  }

  snapshot() {
    return {
      beat: this._beat,
      tasks: Array.from(this.tasks.values()).map(t => t.toDict()),
      complete: this.isComplete(),
    };
  }
}

/**
 * Build a standard organism work order: decompose a high-level goal
 * into a canonical 4-phase task DAG (Plan → Acquire → Execute → Verify).
 */
function buildWorkOrder(goal, agentMap = {}) {
  const dag = new TaskDAG();

  const plan = dag.add({ name: 'Plan', type: 'plan', payload: { goal }, priority: 2.0, assignee: agentMap.planner });
  const acquire = dag.add({ name: 'Acquire', type: 'acquire', payload: { goal }, deps: [plan.id], priority: 1.5, assignee: agentMap.retriever });
  const execute = dag.add({ name: 'Execute', type: 'execute', payload: { goal }, deps: [acquire.id], priority: 1.0, assignee: agentMap.executor });
  const verify  = dag.add({ name: 'Verify',  type: 'verify',  payload: { goal }, deps: [execute.id], priority: 1.2, assignee: agentMap.verifier });

  return { dag, phases: { plan, acquire, execute, verify } };
}

module.exports = { Task, TaskDAG, STATUS, buildWorkOrder, PHI, PHI_INV, newId };
