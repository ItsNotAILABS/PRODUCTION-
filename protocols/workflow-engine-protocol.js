/**
 * PROTO-WORK-002: Workflow Engine Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Higher-level workflow orchestration built on top of the task DAG.
 * A Workflow is a named, versioned collection of task templates that
 * can be instantiated for any context (user, project, vertical).
 *
 * Workflow templates exist for:
 *   - onboarding   : new platform user → env setup → first deploy
 *   - release      : code → test → stage → verify → deploy → announce
 *   - trade        : signal → validate → size → route → fill → report
 *   - analysis     : ingest → clean → model → interpret → present
 *   - build_site   : spec → design → generate → review → deploy
 *   - agent_train  : dataset → eval → train → benchmark → promote
 *
 * Each step is a task template. Instantiation binds the template to
 * real agent assignees and phi-score context.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;
const { TaskDAG, STATUS } = require('./task-orchestration-protocol.js');

const WORKFLOW_TEMPLATE = {
  onboarding: {
    name: 'Platform Onboarding',
    steps: [
      { name: 'Provision Environment', type: 'provision', priority: 2.0 },
      { name: 'Configure Federation',  type: 'configure', priority: 1.8, deps: ['Provision Environment'] },
      { name: 'Deploy First Workload', type: 'deploy',    priority: 1.5, deps: ['Configure Federation'] },
      { name: 'Verify Health',         type: 'verify',    priority: 1.2, deps: ['Deploy First Workload'] },
    ],
  },
  release: {
    name: 'Software Release',
    steps: [
      { name: 'Run Tests',     type: 'test',    priority: 2.0 },
      { name: 'Stage Deploy',  type: 'deploy',  priority: 1.8, deps: ['Run Tests'] },
      { name: 'Smoke Test',    type: 'verify',  priority: 1.6, deps: ['Stage Deploy'] },
      { name: 'Prod Deploy',   type: 'deploy',  priority: 1.4, deps: ['Smoke Test'] },
      { name: 'Monitor',       type: 'monitor', priority: 1.2, deps: ['Prod Deploy'] },
    ],
  },
  trade: {
    name: 'Trading Execution',
    steps: [
      { name: 'Acquire Signal',   type: 'signal',   priority: 2.0 },
      { name: 'Validate Signal',  type: 'validate', priority: 1.9, deps: ['Acquire Signal'] },
      { name: 'Size Position',    type: 'size',     priority: 1.7, deps: ['Validate Signal'] },
      { name: 'Route Order',      type: 'route',    priority: 1.5, deps: ['Size Position'] },
      { name: 'Fill & Confirm',   type: 'execute',  priority: 1.3, deps: ['Route Order'] },
      { name: 'Report',           type: 'report',   priority: 1.0, deps: ['Fill & Confirm'] },
    ],
  },
  analysis: {
    name: 'Data Analysis',
    steps: [
      { name: 'Ingest Data',     type: 'ingest',    priority: 2.0 },
      { name: 'Clean & Validate',type: 'clean',     priority: 1.8, deps: ['Ingest Data'] },
      { name: 'Model',           type: 'model',     priority: 1.5, deps: ['Clean & Validate'] },
      { name: 'Interpret',       type: 'interpret', priority: 1.3, deps: ['Model'] },
      { name: 'Present',         type: 'present',   priority: 1.0, deps: ['Interpret'] },
    ],
  },
  build_site: {
    name: 'Website Build',
    steps: [
      { name: 'Generate Spec',   type: 'spec',     priority: 2.0 },
      { name: 'Generate Code',   type: 'generate', priority: 1.8, deps: ['Generate Spec'] },
      { name: 'Review',          type: 'review',   priority: 1.5, deps: ['Generate Code'] },
      { name: 'Deploy',          type: 'deploy',   priority: 1.3, deps: ['Review'] },
    ],
  },
  agent_eval: {
    name: 'Agent Evaluation',
    steps: [
      { name: 'Load Dataset',    type: 'load',      priority: 2.0 },
      { name: 'Run Benchmarks',  type: 'benchmark', priority: 1.8, deps: ['Load Dataset'] },
      { name: 'Score',           type: 'score',     priority: 1.5, deps: ['Run Benchmarks'] },
      { name: 'Promote or Retry',type: 'promote',   priority: 1.0, deps: ['Score'] },
    ],
  },
};

class WorkflowInstance {
  constructor({ templateName, context = {}, agentMap = {} }) {
    const template = WORKFLOW_TEMPLATE[templateName];
    if (!template) throw new Error(`Unknown workflow template: ${templateName}`);

    this.id           = `wf-${templateName}-${Date.now().toString(36)}`;
    this.templateName = templateName;
    this.name         = template.name;
    this.context      = context;
    this.dag          = new TaskDAG();
    this.phiScore     = 1.0;
    this.createdAt    = Date.now();
    this._taskIds     = {};   // step name → task id

    // Instantiate tasks
    for (const step of template.steps) {
      const deps = (step.deps || []).map(d => this._taskIds[d]).filter(Boolean);
      const t = this.dag.add({
        name:     step.name,
        type:     step.type,
        priority: step.priority,
        deps,
        payload:  { ...context, step: step.name },
        assignee: agentMap[step.type] || agentMap['*'] || null,
      });
      this._taskIds[step.name] = t.id;
    }
  }

  /** Advance the workflow: submit all ready tasks to handler. */
  tick(handler) {
    const ready = this.dag.readyQueue();
    const results = [];
    for (const task of ready) {
      let success = true, result = null, error = null;
      try {
        result = handler ? handler(task) : { ok: true };
        success = result?.ok !== false;
      } catch (e) {
        success = false;
        error   = e.message;
      }
      if (success) {
        this.dag.markDone(task.id, result);
        this.phiScore = Math.min(PHI, this.phiScore * PHI);
      } else {
        this.dag.markFailed(task.id, error);
        this.phiScore = Math.max(0.01, this.phiScore * PHI_INV);
        // Cancel dependents
        this.dag.propagateCancellation(task.id);
      }
      results.push({ taskId: task.id, name: task.name, success });
    }
    return { processed: results.length, tasks: results, complete: this.dag.isComplete() };
  }

  snapshot() {
    return {
      id:           this.id,
      template:     this.templateName,
      name:         this.name,
      phiScore:     this.phiScore.toFixed(4),
      complete:     this.dag.isComplete(),
      dag:          this.dag.snapshot(),
    };
  }
}

/** List all available workflow template names. */
function listTemplates() {
  return Object.entries(WORKFLOW_TEMPLATE).map(([key, t]) => ({
    key,
    name:  t.name,
    steps: t.steps.length,
  }));
}

module.exports = { WorkflowInstance, listTemplates, WORKFLOW_TEMPLATE, PHI, PHI_INV };
