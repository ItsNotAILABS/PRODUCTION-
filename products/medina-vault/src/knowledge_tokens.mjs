// knowledge_tokens.mjs — mintable knowledge units. Distinct from memory tokens.
//
// MEMORY TOKEN (already exists): engagement reward. Earned by writes. Decays with vault.
// KNOWLEDGE TOKEN (this file):   mintable artifact that fuses N inputs into 1 durable unit.
//                                 Has its own SHA hash, lineage, domain set, summary.
//                                 Future sessions UNWRAP instead of re-deriving.
//                                 Does NOT decay — that is the entire point.
//
// Mint formula: id = sha256(sorted_inputs + summary + ts)  → "KT-<12 hex>"
// A knowledge token earns its minter compensation in memory tokens too:
//   mt_reward = log1p(input_count) × len(domains) × φ
// This biases the operator/AI toward minting genuinely fused units, not noise.

import { createHash } from 'node:crypto';

const PHI = 1.618033988749895;

export class KnowledgeLedger {
  constructor() {
    /** @type {Map<string, KnowledgeToken>} */
    this.tokens = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.knowledge_tokens) return;
    for (const t of meta.knowledge_tokens) this.tokens.set(t.id, t);
  }

  toMeta() {
    return { knowledge_tokens: [...this.tokens.values()] };
  }

  /**
   * Mint a knowledge token from N input references.
   *
   * inputs = [{ kind: 'entry'|'token'|'skill'|'session', ref: 'string-id' }, ...]
   * summary = "What this token MEANS — the fused understanding."
   * domains = ['legal', 'finance', ...]
   */
  mint({ name, inputs, summary, domains = [], minter = 'operator' }) {
    if (!name || !summary) return { ok: false, reason: 'NAME_AND_SUMMARY_REQUIRED' };
    if (!Array.isArray(inputs) || inputs.length < 2)
      return { ok: false, reason: 'MIN_2_INPUTS', detail: 'a knowledge token must fuse ≥2 references' };

    // Identity depends on WHAT, not WHEN. Same inputs + same summary → same id.
    // This is correct: re-minting the "same understanding" twice is a duplicate.
    const canonical = inputs.map(i => `${i.kind}:${i.ref}`).sort().join('|');
    const ts = Date.now();
    const hash = createHash('sha256').update(canonical + '||' + summary).digest('hex');
    const id = 'KT-' + hash.slice(0, 12);

    if (this.tokens.has(id)) return { ok: false, reason: 'DUPLICATE', existing_id: id };

    const reward = Math.round(Math.log1p(inputs.length) * Math.max(1, domains.length) * PHI * 100) / 100;
    const token = {
      id, name, summary, domains, inputs,
      minter, ts, hash,
      decay: false,           // knowledge tokens are durable by design
      reward_mt: reward,      // memory tokens awarded to the minter
      unwraps: 0,             // how many times read by anyone
    };
    this.tokens.set(id, token);
    return { ok: true, token, mt_reward: reward };
  }

  unwrap(id) {
    const t = this.tokens.get(id);
    if (!t) return { ok: false, reason: 'NOT_FOUND' };
    t.unwraps += 1;
    return { ok: true, ...t };
  }

  list({ domain, minter, limit = 50 } = {}) {
    let r = [...this.tokens.values()];
    if (domain) r = r.filter(t => t.domains.includes(domain));
    if (minter) r = r.filter(t => t.minter === minter);
    return r.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  search({ query, limit = 25 }) {
    const q = (query || '').toLowerCase();
    return [...this.tokens.values()]
      .filter(t => !q || `${t.name} ${t.summary} ${t.domains.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.unwraps - a.unwraps)
      .slice(0, limit);
  }

  stats() {
    const list = [...this.tokens.values()];
    const byDomain = {};
    let totalUnwraps = 0;
    for (const t of list) {
      totalUnwraps += t.unwraps;
      for (const d of t.domains) byDomain[d] = (byDomain[d] || 0) + 1;
    }
    return {
      total: list.length,
      total_unwraps: totalUnwraps,
      total_mt_minted: Math.round(list.reduce((s, t) => s + (t.reward_mt || 0), 0) * 100) / 100,
      by_domain: byDomain,
      top_unwrapped: list.sort((a, b) => b.unwraps - a.unwraps).slice(0, 5)
        .map(t => ({ id: t.id, name: t.name, unwraps: t.unwraps })),
    };
  }
}

/** @typedef {{
 *   id:string, name:string, summary:string,
 *   domains:string[], inputs:Array<{kind:string,ref:string}>,
 *   minter:string, ts:number, hash:string,
 *   decay:false, reward_mt:number, unwraps:number,
 * }} KnowledgeToken */
