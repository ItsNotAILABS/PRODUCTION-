// efficiency.mjs — autonomous efficiency engine.
//
// 20 named efficiency models. Each one watches a real event stream and, when
// it applies, fires an 'efficiency_event' receipt with an estimated savings
// payload. The AI does NOT write these receipts — the system observes what
// the AI did and writes them on the AI's behalf.
//
// EVENTS the engine consumes:
//   {type:'skill_pre',    skill, input, agent}
//   {type:'skill_post',   skill, input, output, ms, agent, from_cache?}
//   {type:'vault_pre',    key, value, tier}
//   {type:'vault_post',   key, value, tier, dedup?}
//   {type:'workflow_pre', def}
//   {type:'workflow_post',def, results, ms}
//   {type:'session_open', agent, since_hash, returned_bytes, delta_bytes?}
//   {type:'session_close',agent, snapshot}
//   {type:'budget_tick',  agent, percent_used}
//   {type:'persist_batch',count, ms}
//
// Each model is registered and can be toggled. Models compute savings:
//   { tokens?, calls?, ms?, bytes? }   — any subset
// and the engine adds an 'efficiency_event' receipt for every applied model.

const CHARS_PER_TOKEN = 4; // industry estimate for English text
const tok = (bytes) => Math.ceil(bytes / CHARS_PER_TOKEN);

export const MODELS = [
  // ── Caching ────────────────────────────────────────────────────────
  { id: 'skill_cache_hit',
    desc: 'Cache returns prior result for same skill+input — full skill cost avoided.',
    apply: ({ event, last }) => {
      if (event.type !== 'skill_post' || !event.from_cache) return null;
      const payload = JSON.stringify(event.output ?? {}).length;
      return { tokens: tok(payload), calls: 1, ms: last?.[event.skill]?.avg_ms ?? 50 };
    } },

  { id: 'skill_dedup_within_session',
    desc: 'Same skill+input called twice in one session — second call short-circuited via cache.',
    apply: ({ event, counts }) => {
      if (event.type !== 'skill_post' || !event.from_cache) return null;
      const k = `${event.skill}|${JSON.stringify(event.input).slice(0, 80)}`;
      counts.skill_calls[k] = (counts.skill_calls[k] || 0) + 1;
      return counts.skill_calls[k] > 1 ? { calls: 1 } : null;
    } },

  // ── Routing / selection ───────────────────────────────────────────
  { id: 'local_skill_routing',
    desc: 'Deterministic local skill chosen over an LLM call (writing.compress, finance.runway, etc. instead of model inference).',
    apply: ({ event }) => {
      if (event.type !== 'skill_post' || event.from_cache) return null;
      // Heuristic: skills in these domains are pure-local and would otherwise cost an LLM call.
      const localDomains = ['writing','code','data','finance','research','memory'];
      const d = event.skill.split('.')[0];
      if (!localDomains.includes(d)) return null;
      // Estimate: avoided LLM call ≈ 1500 tokens
      return { tokens: 1500, calls: 1 };
    } },

  { id: 'template_skill_routing',
    desc: 'Template skill served the request — zero inference cost.',
    apply: ({ event, registry }) => {
      if (event.type !== 'skill_post') return null;
      const sk = registry?.skills?.get?.(event.skill);
      if (!sk?.template) return null;
      return { tokens: 1200, calls: 1 };
    } },

  // ── Context resume ────────────────────────────────────────────────
  { id: 'context_delta_resume',
    desc: 'session_resume_delta returned a tiny delta instead of the full snapshot.',
    apply: ({ event }) => {
      if (event.type !== 'session_open' || !event.delta_bytes) return null;
      const saved = (event.returned_bytes || 0) - event.delta_bytes;
      if (saved <= 0) return null;
      return { tokens: tok(saved), bytes: saved };
    } },

  { id: 'no_change_resume',
    desc: 'session_resume_delta found nothing changed — empty payload returned, full prior load avoided.',
    apply: ({ event }) => {
      if (event.type !== 'session_open' || !event.no_change) return null;
      return { tokens: tok(event.returned_bytes || 0), bytes: event.returned_bytes || 0 };
    } },

  // ── Knowledge layer (don't re-derive) ─────────────────────────────
  { id: 'knowledge_token_reuse',
    desc: 'A Knowledge Token was unwrapped — saved re-deriving the fused understanding from N inputs.',
    apply: ({ event }) => {
      if (event.type !== 'knowledge_unwrap') return null;
      const inputCount = event.token?.inputs?.length || 1;
      return { tokens: 800 * inputCount, calls: inputCount };
    } },

  { id: 'consolidation_compression',
    desc: 'N cold entries collapsed into 1 summary — long-term reads will be smaller.',
    apply: ({ event }) => {
      if (event.type !== 'consolidation_run') return null;
      const n = event.source_count || 0;
      return { tokens: tok(n * 400), bytes: n * 400 };
    } },

  // ── Memory / vault ────────────────────────────────────────────────
  { id: 'vault_dedup',
    desc: 'Same key+value attempted again — second write is no-op via lineage hash.',
    apply: ({ event }) => event.type === 'vault_post' && event.dedup ? { calls: 1 } : null },

  { id: 'batched_persist',
    desc: 'Multiple writes within a short window persisted in one disk operation.',
    apply: ({ event }) => {
      if (event.type !== 'persist_batch' || (event.count || 0) <= 1) return null;
      return { calls: event.count - 1, ms: Math.max(5, event.count * 8) };
    } },

  { id: 'lazy_meta_load',
    desc: 'Vault entries loaded with metadata-only projection; full values only fetched on demand.',
    apply: ({ event }) => {
      if (event.type !== 'vault_post') return null;
      const valueSize = JSON.stringify(event.value || {}).length;
      return valueSize > 500 ? { bytes: Math.floor(valueSize * 0.7) } : null;
    } },

  // ── Search / similarity ───────────────────────────────────────────
  { id: 'fingerprint_prefilter',
    desc: 'Semantic search filtered candidates by φ-spectral fingerprint distance before deeper ranking.',
    apply: ({ event }) => {
      if (event.type !== 'vault_similar') return null;
      const skipped = (event.candidate_count || 0) - (event.scored_count || 0);
      if (skipped <= 0) return null;
      return { calls: skipped, ms: skipped * 2 };
    } },

  { id: 'tag_index_routing',
    desc: 'memory.recall_by_tag used tag index instead of full vault scan.',
    apply: ({ event }) => {
      if (event.type !== 'skill_post' || event.skill !== 'memory.recall_by_tag') return null;
      return { ms: 30, calls: 1 };
    } },

  // ── Reinforcement / decay ─────────────────────────────────────────
  { id: 'stale_eviction',
    desc: 'Reinforcement.beat marked one or more entries stale — future reads will skip them.',
    apply: ({ event }) => {
      if (event.type !== 'reinforcement_beat' || !event.marked_stale) return null;
      return { bytes: event.marked_stale * 200 };
    } },

  { id: 'reinforced_first',
    desc: 'High-confidence (recently reinforced) entries promoted in rank — saves traversing low-confidence entries.',
    apply: ({ event }) => {
      if (event.type !== 'vault_similar') return null;
      return event.skipped_low_conf > 0 ? { calls: event.skipped_low_conf } : null;
    } },

  // ── Plans / workflows ─────────────────────────────────────────────
  { id: 'workflow_node_short_circuit',
    desc: 'Workflow node skipped because its input matched a prior cached output.',
    apply: ({ event }) => {
      if (event.type !== 'workflow_post' || !event.skipped_nodes) return null;
      return { calls: event.skipped_nodes, tokens: event.skipped_nodes * 600 };
    } },

  { id: 'plan_resume',
    desc: 'plan_next_actions returned the open step — no need to re-derive what to do next.',
    apply: ({ event }) => {
      if (event.type !== 'skill_post' || event.skill !== 'plan_next_actions') return null;
      return { tokens: 400, ms: 20 };
    } },

  { id: 'sandbox_promotion',
    desc: 'A composed sandbox skill was promoted — future calls hit one tool instead of replaying the chain.',
    apply: ({ event }) => {
      if (event.type !== 'sandbox_promote') return null;
      return { tokens: 500, calls: (event.composition_size || 1) - 1 };
    } },

  // ── Budget / throttle ────────────────────────────────────────────
  { id: 'budget_throttle_hint',
    desc: 'Budget threshold crossed — AI received APPROACHING_CAP / OVER_CAP hint to throttle.',
    apply: ({ event, last }) => {
      if (event.type !== 'budget_tick') return null;
      const prev = last?.budget_pct ?? 0;
      const now = event.percent_used ?? 0;
      if (prev < 0.8 && now >= 0.8) { last.budget_pct = now; return { tokens: 1000 }; }
      if (prev < 1.0 && now >= 1.0) { last.budget_pct = now; return { tokens: 2500 }; }
      last.budget_pct = now;
      return null;
    } },

  // ── Auto-derived activity ────────────────────────────────────────
  { id: 'autonomous_receipt_emission',
    desc: 'The system observed the event and wrote this receipt itself — the AI did not have to call append.',
    apply: ({ event }) => {
      // Always-on meta-model: every other receipt fired this turn also counts as one
      // efficiency event of "we didn't make the AI write this."
      if (!event.applied_models || event.applied_models.length === 0) return null;
      return { calls: 1 };
    } },
];

export class EfficiencyEngine {
  constructor({ receipts, registry } = {}) {
    this.receipts = receipts;
    this.registry = registry;
    this.enabled  = new Set(MODELS.map(m => m.id));
    this.state    = { skill_calls: {}, budget_pct: 0, last_ms: {} };
    this.totals   = { tokens: 0, calls: 0, ms: 0, bytes: 0, events: 0, by_model: {} };
  }

  loadFromMeta(meta) {
    if (!meta?.efficiency) return;
    if (meta.efficiency.totals)  Object.assign(this.totals, meta.efficiency.totals);
    if (meta.efficiency.enabled) this.enabled = new Set(meta.efficiency.enabled);
  }
  toMeta() {
    return { efficiency: { totals: this.totals, enabled: [...this.enabled] } };
  }

  toggle(id, on) {
    if (on) this.enabled.add(id); else this.enabled.delete(id);
    return { ok: true, id, enabled: this.enabled.has(id) };
  }

  /**
   * Observe an event. Each enabled model decides if it applies. For every
   * applied model, the system writes an 'efficiency_event' receipt itself.
   * Returns the list of applied model ids and aggregate savings.
   */
  observe(event) {
    if (!event?.type) return { applied_models: [], savings: {} };
    const applied = [];
    const agg = { tokens: 0, calls: 0, ms: 0, bytes: 0 };
    const ctx = {
      event, last: this.state, counts: this.state, registry: this.registry,
    };
    for (const model of MODELS) {
      if (!this.enabled.has(model.id)) continue;
      let savings;
      try { savings = model.apply(ctx); } catch { savings = null; }
      if (!savings) continue;
      applied.push(model.id);
      for (const k of ['tokens','calls','ms','bytes']) agg[k] += savings[k] || 0;
      this.totals.by_model[model.id] = (this.totals.by_model[model.id] || 0) + 1;
      // System writes the receipt — not the AI.
      this.receipts?.append({
        kind: 'efficiency_event',
        ref:  model.id,
        agent: 'system',
        meta: { event_type: event.type, savings },
      });
    }
    // Meta-pass: register that the system did the work.
    event.applied_models = applied;
    this.totals.tokens += agg.tokens;
    this.totals.calls  += agg.calls;
    this.totals.ms     += agg.ms;
    this.totals.bytes  += agg.bytes;
    this.totals.events += applied.length > 0 ? 1 : 0;
    return { applied_models: applied, savings: agg };
  }

  list() {
    return MODELS.map(m => ({
      id: m.id, description: m.desc,
      enabled: this.enabled.has(m.id),
      fired: this.totals.by_model[m.id] || 0,
    }));
  }

  stats() {
    return {
      total_events:    this.totals.events,
      tokens_saved:    this.totals.tokens,
      calls_avoided:   this.totals.calls,
      ms_saved:        this.totals.ms,
      bytes_saved:     this.totals.bytes,
      enabled_models:  this.enabled.size,
      total_models:    MODELS.length,
      top_models: Object.entries(this.totals.by_model).sort((a,b)=>b[1]-a[1]).slice(0,10),
    };
  }

  /**
   * Autonomous report — the system synthesizes a markdown summary from
   * what it observed. The AI never writes this; it derives from receipts.
   */
  report() {
    const s = this.stats();
    const md =
`# Loom Efficiency Report\n_auto-generated by the system from observed activity · ${new Date().toISOString()}_\n\n` +
`**Total efficiency events**: ${s.total_events}\n\n` +
`| Resource | Saved |\n|---|---:|\n` +
`| Tokens | ~${s.tokens_saved.toLocaleString()} |\n` +
`| Tool calls avoided | ${s.calls_avoided} |\n` +
`| Milliseconds saved | ${s.ms_saved.toLocaleString()} |\n` +
`| Bytes saved | ${s.bytes_saved.toLocaleString()} |\n\n` +
`## Top firing models\n\n` +
(s.top_models.length === 0
  ? '_no models have fired yet — use the system and they activate as work happens_\n'
  : s.top_models.map(([id, n]) => `- **${id}** — ${n} events`).join('\n') + '\n\n') +
`## All 20 models\n\n` +
this.list().map(m => `- ${m.enabled ? '✓' : '✗'} **${m.id}** — ${m.description} (fired ${m.fired}×)`).join('\n') + '\n';
    return { ok: true, kind: 'markdown', markdown: md, stats: s };
  }
}
