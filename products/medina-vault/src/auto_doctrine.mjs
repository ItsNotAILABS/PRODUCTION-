// auto_doctrine.mjs — the system extracts doctrine from observed activity.
// "You don't have to tell me. Put it in my vault."
//
// Watches:  efficiency totals (repeated patterns of savings)
//           failure patterns (repeated mistakes → preventive doctrine)
//           knowledge token mints (fused understandings worth promoting)
//           consolidations (worth a doctrine entry)
//
// Writes to ROOT vault when a threshold is crossed. Doctrine entries are
// frozen-by-design — the operator can't accidentally delete them.

const THRESHOLDS = {
  efficiency_model_fire: 10,    // a model fires this many times → doctrine
  failure_pattern_count: 5,     // a pattern recurs this many times → doctrine
  knowledge_token_unwraps: 3,   // a token gets reused this often → doctrine
};

export class AutoDoctrine {
  constructor({ rootVault, receipts, efficiency, failures, knowledge, agent_id = 'system' }) {
    this.rootVault = rootVault;
    this.receipts  = receipts;
    this.efficiency = efficiency;
    this.failures  = failures;
    this.knowledge = knowledge;
    this.agent_id  = agent_id;
    this.last_known = { eff: {}, fail: {}, know: {} };
  }

  loadFromMeta(meta) {
    if (meta?.auto_doctrine?.last_known) this.last_known = meta.auto_doctrine.last_known;
  }
  toMeta() { return { auto_doctrine: { last_known: this.last_known } }; }

  /**
   * Sweep all monitored sources for emergent doctrine candidates.
   * Returns the list of doctrine entries auto-written this pass.
   */
  async sweep({ operator }) {
    const written = [];

    // 1. Efficiency models that have fired enough to be doctrine
    if (this.efficiency) {
      const stats = this.efficiency.stats();
      for (const [model_id, fires] of Object.entries(stats.top_models || [])) { /* normalized below */ }
      // top_models is array of [id, count] pairs
      for (const [model_id, count] of (stats.top_models || [])) {
        const lastSeen = this.last_known.eff[model_id] || 0;
        if (count >= THRESHOLDS.efficiency_model_fire && count - lastSeen >= 5) {
          const r = this.rootVault.write({
            key: `learning/efficiency-pattern/${model_id}`,
            kind: 'learning',
            agent_id: this.agent_id, operator,
            value: `Efficiency model '${model_id}' has fired ${count} times. This is a real, recurring savings pattern. ` +
                   `When you see this work shape, the system will already short-circuit it; do not re-derive.`,
          }, { tags: ['efficiency', 'auto-doctrine'] });
          if (r.ok) { written.push(r.key); this.last_known.eff[model_id] = count;
                      this.receipts?.append({ kind: 'token_mint', ref: r.key, agent: 'system',
                                              meta: { source: 'auto_doctrine.efficiency' } }); }
        }
      }
    }

    // 2. Failure patterns that have recurred → preventive doctrine
    if (this.failures) {
      const patterns = this.failures.list({ pattern_only: true, limit: 100 });
      for (const p of patterns) {
        const lastSeen = this.last_known.fail[p.sig] || 0;
        if (p.count >= THRESHOLDS.failure_pattern_count && p.count > lastSeen) {
          const r = this.rootVault.write({
            key: `doctrine/preventive/${p.sig}`,
            kind: 'doctrine',
            agent_id: this.agent_id, operator,
            value: `Recurring failure pattern: ${p.kind}/${p.reason}${p.skill ? ' on skill ' + p.skill : ''}. ` +
                   `Seen ${p.count} times. Do not repeat the call shape that triggers this; check inputs against the proposal in failures registry.`,
          }, { tags: ['failure', 'preventive', 'auto-doctrine'] });
          if (r.ok) { written.push(r.key); this.last_known.fail[p.sig] = p.count;
                      this.receipts?.append({ kind: 'token_mint', ref: r.key, agent: 'system',
                                              meta: { source: 'auto_doctrine.failure' } }); }
        }
      }
    }

    // 3. Knowledge tokens that are getting REUSED → durable doctrine
    if (this.knowledge) {
      const stats = this.knowledge.stats();
      const tops = stats.top_unwrapped || [];
      for (const t of tops) {
        const lastSeen = this.last_known.know[t.id] || 0;
        if (t.unwraps >= THRESHOLDS.knowledge_token_unwraps && t.unwraps > lastSeen) {
          const r = this.rootVault.write({
            key: `doctrine/durable/${t.id}`,
            kind: 'doctrine',
            agent_id: this.agent_id, operator,
            value: `Knowledge Token ${t.id} ('${t.name}') has been unwrapped ${t.unwraps} times — it represents understanding ` +
                   `that future AIs lean on repeatedly. Treat as load-bearing; do not let it decay; cite it instead of re-deriving.`,
          }, { tags: ['knowledge', 'durable', 'auto-doctrine'] });
          if (r.ok) { written.push(r.key); this.last_known.know[t.id] = t.unwraps;
                      this.receipts?.append({ kind: 'token_mint', ref: r.key, agent: 'system',
                                              meta: { source: 'auto_doctrine.knowledge' } }); }
        }
      }
    }

    return { ok: true, written, count: written.length };
  }
}
