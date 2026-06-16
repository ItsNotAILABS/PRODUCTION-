// sandbox.mjs — Skill sandbox. Compose new skills from existing ones,
// run them N times against sample input, measure stability, promote when proven.
//
// LIFECYCLE
//   draft       → composition saved, never run
//   testing     → at least one run, < min_runs
//   stable      → >= min_runs and stability >= threshold (0.85)
//   promoted    → registered into SkillRegistry as a first-class skill
//   rejected    → operator/AI marked it bad
//
// STABILITY METRIC: of the N runs, how many returned ok=true AND produced a
// result whose structural shape (top-level keys, output kind) matched the first
// successful run. 1.0 = perfectly consistent, 0 = noise.

import { createHash } from 'node:crypto';

export class SkillSandbox {
  constructor({ registry, runner }) {
    this.registry = registry;
    this.runner   = runner;       // WorkflowRunner-shaped
    this.drafts   = new Map();    // id → DraftSkill
    this.minRuns  = 3;
    this.threshold = 0.85;
  }

  loadFromMeta(meta) {
    if (!meta?.sandbox) return;
    for (const d of meta.sandbox) this.drafts.set(d.id, d);
  }
  toMeta() { return { sandbox: [...this.drafts.values()] }; }

  /**
   * Create a draft composed skill.
   * composition = { id, nodes: [{id, skill, input}] }
   */
  draft({ name, description, composition, sample_inputs = [] }) {
    if (!name || !composition?.nodes?.length)
      return { ok: false, reason: 'NAME_AND_COMPOSITION_REQUIRED' };
    const hash = createHash('sha256').update(JSON.stringify(composition)).digest('hex').slice(0, 8);
    const id = `draft_${hash}`;
    const draft = {
      id, name, description: description || `Composed skill: ${name}`,
      composition, sample_inputs,
      status: 'draft', runs: [], created: Date.now(),
    };
    this.drafts.set(id, draft);
    return { ok: true, draft };
  }

  /** Run the draft against a sample input; capture the result. */
  async test(id, input = {}) {
    const d = this.drafts.get(id);
    if (!d) return { ok: false, reason: 'DRAFT_NOT_FOUND' };
    const filled = JSON.parse(JSON.stringify(d.composition, (k, v) =>
      typeof v === 'string'
        ? v.replace(/\$\{([^}|.]+)\}/g, (_, key) => input[key] ?? `\${${key}}`)
        : v));
    const r = await this.runner.run(filled);
    const result = {
      ts: Date.now(),
      ok: r.ok,
      ran_nodes: r.ran_nodes,
      output_shape: r.ok ? shapeOf(r.results) : null,
    };
    d.runs.push(result);
    d.status = d.status === 'draft' ? 'testing' : d.status;
    return { ok: true, draft_id: id, run: result };
  }

  /** Recompute stability from runs; advance status. */
  evaluate(id) {
    const d = this.drafts.get(id);
    if (!d) return { ok: false, reason: 'DRAFT_NOT_FOUND' };
    if (!d.runs.length) return { ok: true, id, status: d.status, stability: 0, runs: 0 };
    const okRuns = d.runs.filter(r => r.ok);
    if (!okRuns.length) {
      d.status = 'rejected';
      return { ok: true, id, status: d.status, stability: 0, runs: d.runs.length };
    }
    const refShape = JSON.stringify(okRuns[0].output_shape);
    const matching = okRuns.filter(r => JSON.stringify(r.output_shape) === refShape).length;
    const stability = matching / d.runs.length;
    if (d.runs.length >= this.minRuns && stability >= this.threshold) d.status = 'stable';
    return { ok: true, id, status: d.status, stability: Math.round(stability * 1000) / 1000,
             runs: d.runs.length, ok_runs: okRuns.length };
  }

  /** Promote a stable draft into the SkillRegistry as a real callable skill. */
  promote(id) {
    const d = this.drafts.get(id);
    if (!d) return { ok: false, reason: 'DRAFT_NOT_FOUND' };
    if (d.status !== 'stable') return { ok: false, reason: 'NOT_STABLE', current_status: d.status };
    const skillName = `composed.${d.name}`;
    const composition = d.composition;
    const runner = this.runner;
    this.registry.register({
      name: skillName,
      description: d.description + ' [promoted from sandbox]',
      inputSchema: { type: 'object', properties: {} },
      async run(input) {
        const filled = JSON.parse(JSON.stringify(composition, (k, v) =>
          typeof v === 'string'
            ? v.replace(/\$\{([^}|.]+)\}/g, (_, key) => input[key] ?? `\${${key}}`)
            : v));
        return await runner.run(filled);
      },
      composed: true,
      lineage: d.composition,
    });
    d.status = 'promoted';
    d.promoted_as = skillName;
    return { ok: true, id, promoted_as: skillName };
  }

  list() {
    return [...this.drafts.values()].map(d => ({
      id: d.id, name: d.name, status: d.status,
      runs: d.runs.length, nodes: d.composition.nodes.length,
      created: d.created, promoted_as: d.promoted_as,
    }));
  }
}

/** Hash-style structural fingerprint of a result: kind + sorted top-level keys. */
function shapeOf(obj) {
  if (obj === null || typeof obj !== 'object') return typeof obj;
  if (Array.isArray(obj)) return `array[${obj.length ? shapeOf(obj[0]) : 'empty'}]`;
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) {
    const v = obj[k];
    out[k] = (v && typeof v === 'object') ? 'object' : typeof v;
  }
  return out;
}
