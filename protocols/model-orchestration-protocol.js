/**
 * PROTO-AI-002: Model Orchestration & Fine-Tuning
 * ═════════════════════════════════════════════════════════════════════
 *
 * Orchestrates multiple AI models, routes tasks to best-fit model,
 * manages in-flight fine-tuning jobs, and evaluates output quality.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const MODEL_STATE = Object.freeze({
  IDLE:          'idle',
  TRAINING:      'training',
  EVALUATING:    'evaluating',
  INFERENCE:     'inference',
  DEGRADED:      'degraded',
});

const TASK_CLASS = Object.freeze({
  GENERATION:    'generation',
  CLASSIFICATION:'classification',
  REASONING:     'reasoning',
  CODE:          'code',
  MULTIMODAL:    'multimodal',
});

class ModelOrchestrator {
  constructor() {
    this.models = {};
    this.taskQueue = [];
    this.activeJobs = {};
    this._beat = 0;
  }

  registerModel(modelId, { name = '', capabilities = [], capacity = 1.0, costPerInfer = 0.0001 } = {}) {
    this.models[modelId] = {
      modelId,
      name,
      capabilities,
      state: MODEL_STATE.IDLE,
      capacity,
      utilization: 0,
      costPerInfer,
      successRate: 1.0,
      phiScore: 1.0,
      createdAt: Date.now(),
    };
  }

  enqueueTask(task) {
    const taskId = `task-${this._beat}-${Math.random().toString(36).slice(2, 9)}`;
    const record = {
      taskId,
      task,
      class: task.class || TASK_CLASS.GENERATION,
      enqueuedAt: Date.now(),
      assignedTo: null,
      result: null,
      state: 'pending',
    };
    this.taskQueue.push(record);
    return taskId;
  }

  scheduleTask(taskId) {
    const task = this.taskQueue.find(t => t.taskId === taskId);
    if (!task) return { ok: false, error: 'task_not_found' };

    const candidates = Object.values(this.models)
      .filter(m => m.state !== MODEL_STATE.DEGRADED &&
                   m.capabilities.includes(task.class))
      .sort((a, b) => {
        const scoreA = a.phiScore * (1 - a.utilization) * a.successRate;
        const scoreB = b.phiScore * (1 - b.utilization) * b.successRate;
        return scoreB - scoreA;
      });

    if (candidates.length === 0) {
      return { ok: false, error: 'no_capable_models' };
    }

    const best = candidates[0];
    task.assignedTo = best.modelId;
    task.state = 'scheduled';
    best.utilization = Math.min(1.0, best.utilization + 0.3);
    best.state = MODEL_STATE.INFERENCE;

    return { ok: true, modelId: best.modelId, taskId };
  }

  completeTask(taskId, result = {}) {
    const task = this.taskQueue.find(t => t.taskId === taskId);
    if (!task) return false;

    const model = this.models[task.assignedTo];
    if (model) {
      const success = result.ok !== false;
      model.utilization = Math.max(0, model.utilization - 0.3);
      model.successRate = success
        ? Math.min(1.0, model.successRate * PHI)
        : Math.max(0.1, model.successRate * PHI_INV);
      model.phiScore = success
        ? Math.min(PHI, model.phiScore * PHI)
        : Math.max(0.1, model.phiScore * PHI_INV);
      if (model.utilization === 0) model.state = MODEL_STATE.IDLE;
    }

    task.result = result;
    task.state = success ? 'succeeded' : 'failed';
    task.completedAt = Date.now();
    return true;
  }

  submitFineTuning(modelId, dataset) {
    if (!this.models[modelId]) return { ok: false, error: 'model_not_found' };

    const jobId = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.activeJobs[jobId] = {
      jobId,
      modelId,
      dataset,
      state: 'training',
      progress: 0,
      startedAt: Date.now(),
      estimatedCompletionMs: 60000,
    };

    this.models[modelId].state = MODEL_STATE.TRAINING;
    return { ok: true, jobId };
  }

  checkFinetuningStatus(jobId) {
    return this.activeJobs[jobId] || { ok: false, error: 'job_not_found' };
  }

  pulse() {
    this._beat++;
    for (const jobId in this.activeJobs) {
      const job = this.activeJobs[jobId];
      const elapsed = Date.now() - job.startedAt;
      job.progress = Math.min(100, (elapsed / job.estimatedCompletionMs) * 100);

      if (elapsed > job.estimatedCompletionMs) {
        job.state = 'completed';
        const model = this.models[job.modelId];
        if (model) model.state = MODEL_STATE.IDLE;
        delete this.activeJobs[jobId];
      }
    }

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      if (task.state === 'pending') {
        const sched = this.scheduleTask(task.taskId);
        if (!sched.ok) break;
      }
      this.taskQueue.shift();
    }

    return {
      beat: this._beat,
      models: Object.keys(this.models).length,
      activeJobs: Object.keys(this.activeJobs).length,
      queuedTasks: this.taskQueue.length,
    };
  }

  snapshot() {
    return {
      models: Object.values(this.models).map(m => ({
        modelId: m.modelId,
        name: m.name,
        state: m.state,
        utilization: +(m.utilization.toFixed(3)),
        successRate: +(m.successRate.toFixed(4)),
        phiScore: +(m.phiScore.toFixed(4)),
      })),
      activeJobs: Object.keys(this.activeJobs).length,
      pendingTasks: this.taskQueue.filter(t => t.state === 'pending').length,
    };
  }
}

module.exports = { ModelOrchestrator, MODEL_STATE, TASK_CLASS };
