// plans.mjs — multi-session plans. The AI's TODO list that survives context loss.
//
// Plans persist in vault::_meta.plans. Each plan = ordered list of Steps with
// status (todo / doing / done / blocked / skipped). Plans can be paused by a
// session close and resumed in the next session. Each step keeps a brief log.
//
// Steps can carry intended_skill or intended_workflow refs — turning a plan
// into a partly-executable spec the operator can review and the AI can run.

import { createHash } from 'node:crypto';

const STATUSES = new Set(['todo','doing','done','blocked','skipped']);

export class PlanLedger {
  constructor() {
    /** @type {Map<string, Plan>} */
    this.plans = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.plans) return;
    for (const p of meta.plans) this.plans.set(p.id, p);
  }
  toMeta() { return { plans: [...this.plans.values()] }; }

  /**
   * Create a plan.
   * steps = [{ title, intended_skill?, intended_workflow?, notes? }, ...]
   */
  create({ title, steps = [], owner = 'operator', why = '' }) {
    if (!title || !steps.length) return { ok: false, reason: 'TITLE_AND_STEPS_REQUIRED' };
    const ts = Date.now();
    const id = 'plan_' + createHash('sha256').update(title + ts).digest('hex').slice(0, 8);
    const plan = {
      id, title, why, owner, created: ts, updated: ts,
      status: 'doing',
      steps: steps.map((s, i) => ({
        id: i, title: s.title || `step ${i + 1}`,
        intended_skill: s.intended_skill ?? null,
        intended_workflow: s.intended_workflow ?? null,
        notes: s.notes ?? '',
        status: 'todo',
        log: [],
      })),
    };
    this.plans.set(id, plan);
    return { ok: true, plan };
  }

  advance(id, stepId, { status, log, note } = {}) {
    const plan = this.plans.get(id);
    if (!plan) return { ok: false, reason: 'PLAN_NOT_FOUND' };
    const step = plan.steps[stepId];
    if (!step) return { ok: false, reason: 'STEP_NOT_FOUND' };
    if (status && !STATUSES.has(status)) return { ok: false, reason: 'INVALID_STATUS', allowed: [...STATUSES] };
    if (status) step.status = status;
    if (log || note) step.log.push({ ts: Date.now(), text: log || note });
    plan.updated = Date.now();

    // Roll plan status up
    const all = plan.steps.every(s => s.status === 'done' || s.status === 'skipped');
    const blocked = plan.steps.some(s => s.status === 'blocked');
    plan.status = all ? 'done' : (blocked ? 'blocked' : 'doing');

    return { ok: true, plan_id: id, step_id: stepId, step, plan_status: plan.status };
  }

  pause(id) {
    const plan = this.plans.get(id);
    if (!plan) return { ok: false, reason: 'PLAN_NOT_FOUND' };
    plan.status = 'paused';
    plan.updated = Date.now();
    return { ok: true, plan };
  }

  resume(id) {
    const plan = this.plans.get(id);
    if (!plan) return { ok: false, reason: 'PLAN_NOT_FOUND' };
    plan.status = 'doing';
    plan.updated = Date.now();
    return { ok: true, plan };
  }

  list({ owner, status, limit = 50 } = {}) {
    let r = [...this.plans.values()];
    if (owner)  r = r.filter(p => p.owner === owner);
    if (status) r = r.filter(p => p.status === status);
    return r.sort((a, b) => b.updated - a.updated).slice(0, limit)
      .map(p => ({
        id: p.id, title: p.title, owner: p.owner, status: p.status,
        steps_total: p.steps.length,
        steps_done:  p.steps.filter(s => s.status === 'done').length,
        steps_blocked: p.steps.filter(s => s.status === 'blocked').length,
        updated: p.updated,
      }));
  }

  get(id) {
    const p = this.plans.get(id);
    return p ? { ok: true, plan: p } : { ok: false, reason: 'PLAN_NOT_FOUND' };
  }

  /** Return next actionable step across all active plans (status=doing, step=todo or blocked). */
  nextActions({ owner, limit = 5 } = {}) {
    const out = [];
    for (const p of this.plans.values()) {
      if (p.status !== 'doing') continue;
      if (owner && p.owner !== owner) continue;
      const step = p.steps.find(s => s.status === 'todo' || s.status === 'doing');
      if (!step) continue;
      out.push({
        plan_id: p.id, plan_title: p.title,
        step_id: step.id, step_title: step.title,
        step_status: step.status,
        intended_skill: step.intended_skill,
        intended_workflow: step.intended_workflow,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  stats() {
    const list = [...this.plans.values()];
    return {
      total: list.length,
      by_status: list.reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {}),
      open_steps: list.reduce((s, p) => s + p.steps.filter(x => x.status === 'todo' || x.status === 'doing').length, 0),
    };
  }
}

/** @typedef {{id:string,title:string,steps:object[],status:string,owner:string,created:number,updated:number}} Plan */
