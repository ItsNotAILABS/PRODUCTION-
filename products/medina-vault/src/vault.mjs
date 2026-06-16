// ─────────────────────────────────────────────────────────────────────────
// vault.mjs — Medina Vault: team-vault primitive + RECITAL lineage.
//
// MEANING:     A four-tier sovereign memory keyed by a string, where every
//              public method passes through laws.mjs before touching state.
// MODEL:       Map<key, Entry{ ..., lineage: [head_hash, head_hash, ...] }>
// COMPUTATION: store → recital() check → write + extend lineage.
//              retrieve → dualRead() check → return or null+reason.
// EXECUTION:   Persisted to disk via FileStore (snapshot.mjs).
//
// Derived from: ItsNotAILABS `team-vault@1.0.0` (MIT). The extension here
// is the RECITAL lineage and the law middleware — making the vault a
// MEDINA-PROTOCOL/0.1 conformant node, not just a key-value with tiers.
// ─────────────────────────────────────────────────────────────────────────

import {
  DECAY_RATE, DEFAULT_TTL, DECAY_THRESHOLD, TIER_ORDER, EMPTY_RECITAL,
  hashEntry, strength, ttlAlive, dualRead, recital, isTier,
} from './laws.mjs';

export { hashEntry, strength };

export class MedinaVault {
  constructor() {
    /** @type {Map<string, object>} */
    this.entries = new Map();
  }

  // ── Store ──────────────────────────────────────────────────────────────

  /**
   * Store an entry. Passes through RECITAL_PLUS_ONE.
   * @returns { ok, entry? , reason?, lineage_depth?, head_hash? }
   */
  store({ key, value, tier, ownerId, prior_hash, ttlMs, decayRate,
          sharedWith, metadata } = {}) {
    if (typeof key !== 'string' || key.length === 0)
      return { ok: false, reason: 'KEY_REQUIRED' };
    if (typeof ownerId !== 'string' || ownerId.length === 0)
      return { ok: false, reason: 'OWNER_REQUIRED' };
    if (!isTier(tier))
      return { ok: false, reason: 'INVALID_TIER' };

    const head = this.entries.get(key) ?? null;
    const rec = recital({ prior_hash, ownerId }, head);
    if (!rec.ok) return rec;

    // SOVEREIGN entries are never shared at creation; the law is explicit.
    const safeSharedWith = tier === 'SOVEREIGN' ? [] : (sharedWith ?? head?.sharedWith ?? []);
    const now = Date.now();
    const ttl = ttlMs ?? head?.ttlMs ?? DEFAULT_TTL[tier];
    const decay = decayRate ?? head?.decayRate ?? DECAY_RATE[tier];

    const entry = {
      key,
      value,
      tier,
      ownerId,
      sharedWith: safeSharedWith,
      ttlMs: ttl,
      createdAt: now,
      expiresAt: ttl === Infinity ? Infinity : now + ttl,
      decayRate: decay,
      metadata: metadata ?? head?.metadata ?? {},
      lineage: [...(head?.lineage ?? []), hashEntry(head)],
    };
    this.entries.set(key, entry);
    return {
      ok: true,
      entry,
      lineage_depth: entry.lineage.length,
      head_hash: hashEntry(entry),
    };
  }

  // ── Retrieve ───────────────────────────────────────────────────────────

  /** Returns { ok, entry?, reason?, strength? } */
  retrieve(key, requesterId) {
    const entry = this.entries.get(key);
    if (!entry) return { ok: false, reason: 'NOT_FOUND' };
    const now = Date.now();
    const verdict = dualRead(entry, requesterId, now);
    if (!verdict.ok) {
      // Sweep expired/decayed on read — consistent with team-vault behavior.
      if (verdict.reason === 'EXPIRED' || verdict.reason === 'DECAYED') {
        this.entries.delete(key);
      }
      return verdict;
    }
    return { ok: true, entry, strength: strength(entry, now) };
  }

  // ── Share / Promote / Demote ───────────────────────────────────────────

  share(key, ownerId, targetAgentId) {
    const e = this.entries.get(key);
    if (!e)                                    return { ok: false, reason: 'NOT_FOUND' };
    if (e.ownerId !== ownerId)                 return { ok: false, reason: 'OWNER_ONLY' };
    if (e.tier === 'SOVEREIGN')                return { ok: false, reason: 'SOVEREIGN_UNSHAREABLE' };
    if (e.tier !== 'PRIVATE')                  return { ok: false, reason: 'SHARE_REQUIRES_PRIVATE_TIER' };
    if (!e.sharedWith.includes(targetAgentId)) e.sharedWith.push(targetAgentId);
    return { ok: true, sharedWith: e.sharedWith };
  }

  promote(key, ownerId, newTier) {
    const e = this.entries.get(key);
    if (!e)                                            return { ok: false, reason: 'NOT_FOUND' };
    if (e.ownerId !== ownerId)                         return { ok: false, reason: 'OWNER_ONLY' };
    if (!isTier(newTier))                              return { ok: false, reason: 'INVALID_TIER' };
    if (TIER_ORDER.indexOf(newTier) <= TIER_ORDER.indexOf(e.tier))
                                                       return { ok: false, reason: 'NOT_A_PROMOTION' };
    e.tier = newTier;
    if (newTier === 'SOVEREIGN') e.sharedWith = [];
    return { ok: true, tier: e.tier };
  }

  // ── Sweeps ─────────────────────────────────────────────────────────────

  sweep() {
    const now = Date.now();
    let expired = 0, decayed = 0;
    for (const [key, e] of this.entries) {
      if (!ttlAlive(e, now))                  { this.entries.delete(key); expired++; continue; }
      if (strength(e, now) < DECAY_THRESHOLD) { this.entries.delete(key); decayed++; }
    }
    return { expired, decayed, remaining: this.entries.size };
  }

  // ── Queries ────────────────────────────────────────────────────────────

  list(requesterId, { tier, prefix } = {}) {
    const now = Date.now();
    const out = [];
    for (const e of this.entries.values()) {
      if (tier && e.tier !== tier) continue;
      if (prefix && !e.key.startsWith(prefix)) continue;
      const verdict = dualRead(e, requesterId, now);
      if (!verdict.ok) continue;
      out.push({
        key: e.key, tier: e.tier, ownerId: e.ownerId,
        createdAt: e.createdAt, expiresAt: e.expiresAt,
        strength: strength(e, now), lineage_depth: e.lineage.length,
        metadata: e.metadata,
      });
    }
    return out;
  }

  /**
   * Substring search across keys, stringified values, and metadata tags.
   * φ-aware: results ranked by current strength × match-signal weight.
   * DUAL_READ enforced per entry (no leakage of forbidden tiers).
   */
  search(requesterId, { query = '', tier, tag, limit = 20 } = {}) {
    const now = Date.now();
    const q = String(query).toLowerCase();
    const wantTag = tag ? String(tag).toLowerCase() : null;
    const hits = [];

    for (const e of this.entries.values()) {
      if (tier && e.tier !== tier) continue;
      if (!dualRead(e, requesterId, now).ok) continue;

      const keyL  = e.key.toLowerCase();
      const valL  = (typeof e.value === 'string' ? e.value : JSON.stringify(e.value ?? '')).toLowerCase();
      const tags  = (e.metadata?.tags ?? []).map(t => String(t).toLowerCase());

      let signal = 0;
      if (wantTag && tags.includes(wantTag))           signal += 1.0;
      if (q && keyL.includes(q))                       signal += 0.6;
      if (q && valL.includes(q))                       signal += 0.4;
      if (!q && !wantTag)                              signal  = 0.5; // browse mode

      if (signal === 0) continue;

      const s = strength(e, now);
      hits.push({
        key: e.key, tier: e.tier, ownerId: e.ownerId,
        strength: s, lineage_depth: e.lineage.length,
        match_signal: Math.round(signal * 1000) / 1000,
        rank: Math.round(signal * s * 1000) / 1000,
        snippet: typeof e.value === 'string'
          ? e.value.slice(0, 160)
          : JSON.stringify(e.value ?? null).slice(0, 160),
        metadata: e.metadata,
      });
    }
    return hits.sort((a, b) => b.rank - a.rank).slice(0, limit);
  }

  /**
   * Return the recital lineage for a key — the hash chain from genesis
   * to head. Read-gated by DUAL_READ on the current entry.
   */
  lineage(key, requesterId) {
    const e = this.entries.get(key);
    if (!e) return { ok: false, reason: 'NOT_FOUND' };
    const verdict = dualRead(e, requesterId);
    if (!verdict.ok) return verdict;
    // hashEntry(current) is the *head* — append it so the chain shows
    // the complete history end-to-end.
    return {
      ok: true,
      key,
      genesis_hash: e.lineage[0] ?? '0'.repeat(64),
      chain: [...e.lineage, hashEntry(e)],
      depth: e.lineage.length,
      head_hash: hashEntry(e),
    };
  }

  status() {
    const counts = { PUBLIC: 0, SHARED: 0, PRIVATE: 0, SOVEREIGN: 0, total: 0 };
    for (const e of this.entries.values()) { counts[e.tier]++; counts.total++; }
    return counts;
  }

  // ── Persistence support ────────────────────────────────────────────────

  toJSON() {
    return { protocol: 'MEDINA-PROTOCOL/0.1',
             entries: Array.from(this.entries.entries()) };
  }

  loadFromJSON(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.entries)) return;
    this.entries.clear();
    for (const [k, v] of snapshot.entries) this.entries.set(k, v);
  }
}
