// workflows.mjs — multi-step skill chains. A workflow is a DAG of nodes;
// each node calls a skill and binds its output into ctx for downstream
// nodes via simple ${node.field} template substitution. Workflows persist
// in vault.json::_meta.workflow_runs and earn tokens like writes do.

export class WorkflowRunner {
  constructor({ registry }) {
    this.registry = registry;
    this.runs = []; // { id, definition, results, ok, ts }
    this.maxRuns = 50;
  }

  /**
   * definition = {
   *   id: 'open_engagement',
   *   nodes: [
   *     { id: 'eng',     skill: 'legal.engagement_letter', input: {...} },
   *     { id: 'invoice', skill: 'legal.invoice',           input: { invoice_number: 'INV-${eng.summary|hash}', ... } },
   *   ]
   * }
   */
  async run(definition, ctx = {}) {
    if (!definition?.id || !Array.isArray(definition.nodes))
      return { ok: false, reason: 'INVALID_WORKFLOW' };
    const results = {};
    let allOk = true;
    for (const node of definition.nodes) {
      const resolved = resolveInput(node.input ?? {}, results);
      const r = await this.registry.run(node.skill, resolved, ctx);
      results[node.id] = r;
      if (!r.ok) { allOk = false; if (!node.continue_on_error) break; }
    }
    const rec = {
      id: definition.id,
      ok: allOk,
      ran_nodes: Object.keys(results).length,
      results,
      ts: new Date().toISOString(),
    };
    this.runs.push(rec);
    if (this.runs.length > this.maxRuns) this.runs.shift();
    return { ok: allOk, ...rec };
  }

  status({ limit = 10 } = {}) {
    return this.runs.slice(-limit).reverse().map(r => ({
      id: r.id, ok: r.ok, ran_nodes: r.ran_nodes, ts: r.ts,
      node_summaries: Object.fromEntries(
        Object.entries(r.results).map(([k, v]) => [k, { ok: v.ok, reason: v.reason ?? null, summary: v.summary ?? null }])),
    }));
  }
}

function resolveInput(input, results) {
  if (input === null || typeof input !== 'object') return resolveScalar(input, results);
  if (Array.isArray(input)) return input.map(v => resolveInput(v, results));
  const out = {};
  for (const [k, v] of Object.entries(input)) out[k] = resolveInput(v, results);
  return out;
}

function resolveScalar(v, results) {
  if (typeof v !== 'string') return v;
  return v.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const [path, mod] = expr.split('|');
    const segs = path.split('.');
    let cur = results;
    for (const s of segs) cur = cur?.[s];
    if (cur == null) return '';
    if (mod === 'hash') return String(cur).slice(0, 8);
    return String(cur);
  });
}
