// tokens.mjs — memory tokens (PROTOCOL_09).
// Formula: tokens_earned(write) = tier_weight × (1 + lineage_depth · φ⁻¹)
// Tier weights are Fibonacci: F(1)=1, F(3)=2, F(5)=5, F(7)=13.

const PHI_INV = 1 / 1.618033988749895;

export const TIER_WEIGHT = Object.freeze({
  PUBLIC:    1,   // F(1)
  SHARED:    2,   // F(3)
  PRIVATE:   5,   // F(5)
  SOVEREIGN: 13,  // F(7)
});

export function tokenValue(tier, lineageDepth = 0) {
  const w = TIER_WEIGHT[tier] ?? 1;
  return Math.round(w * (1 + lineageDepth * PHI_INV) * 100) / 100;
}

export class TokenLedger {
  constructor() {
    /** @type {Map<string, number>} balance per agent */
    this.balances = new Map();
    /** @type {Map<string, {writes:number, by_tier:Record<string,number>}>} */
    this.stats = new Map();
  }

  loadFromMeta(meta) {
    if (!meta) return;
    if (meta.tokens) {
      for (const [k, v] of Object.entries(meta.tokens)) this.balances.set(k, Number(v) || 0);
    }
    if (meta.token_stats) {
      for (const [k, v] of Object.entries(meta.token_stats)) this.stats.set(k, v);
    }
  }

  toMeta() {
    return {
      tokens: Object.fromEntries(this.balances),
      token_stats: Object.fromEntries(this.stats),
    };
  }

  award(agentId, { tier, lineageDepth = 0 }) {
    const earned = tokenValue(tier, lineageDepth);
    this.balances.set(agentId, Math.round(((this.balances.get(agentId) || 0) + earned) * 100) / 100);
    const s = this.stats.get(agentId) || { writes: 0, by_tier: { PUBLIC: 0, SHARED: 0, PRIVATE: 0, SOVEREIGN: 0 } };
    s.writes += 1;
    s.by_tier[tier] = (s.by_tier[tier] || 0) + 1;
    this.stats.set(agentId, s);
    return earned;
  }

  view(agentId) {
    const balance = this.balances.get(agentId) || 0;
    const s = this.stats.get(agentId) || { writes: 0, by_tier: {} };
    // Rank on node.
    const sorted = [...this.balances.entries()].sort((a, b) => b[1] - a[1]);
    const rank = sorted.findIndex(([id]) => id === agentId) + 1;
    return {
      ok: true,
      agent_id: agentId,
      tokens: balance,
      writes: s.writes,
      by_tier: s.by_tier,
      rank_on_node: rank || sorted.length + 1,
      total_agents: this.balances.size,
    };
  }

  leaderboard(limit = 10) {
    return [...this.balances.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([agent_id, tokens], i) => ({ rank: i + 1, agent_id, tokens }));
  }
}
