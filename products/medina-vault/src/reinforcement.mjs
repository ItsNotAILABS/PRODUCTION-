// reinforcement.mjs — per-entry confidence with φ-decay + reinforcement reset.
//
// φ-decay law (from MedinaMemorySystems):
//   confidence(t+1) = confidence(t) × (1 - 1/φ)  ≈  × 0.382
// Reinforcement (validated read):
//   confidence ← 1.0  (and lastSeen ← now)
// Cold entries (< minConfidence) get marked 'stale' but kept until vault sweep.
//
// We don't mutate vault entries directly — we keep a side-table in
// vault::_meta.reinforcement keyed by entry key, so the original entry shape
// is unchanged and the protocol stays clean.

const PHI = 1.618033988749895;
const DECAY_PER_BEAT = 1 - (1 / PHI); // ≈ 0.382
const STALE_BELOW    = 0.05;

export class Reinforcement {
  constructor() {
    /** @type {Map<string, {confidence:number, lastSeen:number, reads:number, validated:number, stale:boolean}>} */
    this.records = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.reinforcement) return;
    for (const [k, v] of Object.entries(meta.reinforcement)) this.records.set(k, v);
  }
  toMeta() { return { reinforcement: Object.fromEntries(this.records) }; }

  _ensure(key) {
    if (!this.records.has(key)) {
      this.records.set(key, { confidence: 1.0, lastSeen: Date.now(), reads: 0, validated: 0, stale: false });
    }
    return this.records.get(key);
  }

  /** A read that does NOT count as validation (you looked but didn't confirm). */
  read(key) {
    const r = this._ensure(key);
    r.reads++;
    r.lastSeen = Date.now();
    return { ok: true, key, ...r };
  }

  /** A validated read — the AI used this entry successfully. Reset to full confidence. */
  reinforce(key) {
    const r = this._ensure(key);
    r.validated++;
    r.confidence = 1.0;
    r.lastSeen = Date.now();
    r.stale = false;
    return { ok: true, key, ...r };
  }

  /** Apply one beat of φ-decay to all records that haven't been seen recently. */
  beat({ minQuietMs = 60 * 1000 } = {}) {
    const now = Date.now();
    let decayed = 0, marked = 0;
    for (const [k, r] of this.records) {
      if (now - r.lastSeen < minQuietMs) continue;
      r.confidence *= DECAY_PER_BEAT;
      decayed++;
      if (r.confidence < STALE_BELOW && !r.stale) { r.stale = true; marked++; }
    }
    return { ok: true, decayed, marked_stale: marked, total: this.records.size };
  }

  describe(key) {
    const r = this.records.get(key);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: true, key, ...r };
  }

  list({ stale, minConfidence, limit = 50 } = {}) {
    let r = [...this.records.entries()].map(([k, v]) => ({ key: k, ...v }));
    if (stale != null) r = r.filter(x => x.stale === stale);
    if (minConfidence != null) r = r.filter(x => x.confidence >= minConfidence);
    return r.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, limit);
  }

  stats() {
    const list = [...this.records.values()];
    const conf = list.map(r => r.confidence);
    return {
      total: list.length,
      stale: list.filter(r => r.stale).length,
      mean_confidence: conf.length ? Math.round((conf.reduce((s, v) => s + v, 0) / conf.length) * 1000) / 1000 : 0,
      validated_total: list.reduce((s, r) => s + r.validated, 0),
    };
  }
}
