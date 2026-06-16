// workspace.mjs — AI working space. What I (the AI) hold in my head right now.
//
// FOCUS SLOTS    — capped LRU buffer of N keys I'm currently working with.
//                  Default 7 (Miller's 7±2). Drop the coldest when full.
// SCRATCHPAD     — ephemeral notes that auto-expire (default 4 hours).
//                  Promotable to vault when proven useful (read >= 2 times).
// REINFORCEMENT  — every focus access bumps the entry's `confidence` (1.0)
//                  and resets its decay timer. Cold entries trail off.
//
// Both per-agent. Persisted under vault::_meta.workspaces[agentId].

const FOCUS_CAPACITY    = 7;
const SCRATCH_TTL_MS    = 4 * 60 * 60 * 1000;     // 4 hours
const PROMOTE_THRESHOLD = 2;                      // reads to qualify for promotion

export class Workspace {
  constructor() {
    /** @type {Map<string, AgentSpace>} */
    this.spaces = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.workspaces) return;
    for (const [agentId, sp] of Object.entries(meta.workspaces)) {
      sp.focus = new Map(sp.focus || []);
      sp.scratchpad = new Map(sp.scratchpad || []);
      this.spaces.set(agentId, sp);
    }
  }
  toMeta() {
    const out = {};
    for (const [a, sp] of this.spaces) {
      out[a] = {
        focus: [...sp.focus],
        scratchpad: [...sp.scratchpad],
        stats: sp.stats,
      };
    }
    return { workspaces: out };
  }

  _ensure(agentId) {
    if (!this.spaces.has(agentId)) {
      this.spaces.set(agentId, {
        focus: new Map(),
        scratchpad: new Map(),
        stats: { focuses: 0, scratches: 0, promotions: 0 },
      });
    }
    return this.spaces.get(agentId);
  }

  /** Add or refresh a key in the focus slots. LRU eviction when at capacity. */
  focus(agentId, key, value) {
    const sp = this._ensure(agentId);
    const now = Date.now();
    if (sp.focus.has(key)) {
      const existing = sp.focus.get(key);
      existing.lastTouched = now;
      existing.touches = (existing.touches || 0) + 1;
      existing.confidence = 1.0; // reinforcement reset
      if (value !== undefined) existing.value = value;
      // Move to most-recent position
      sp.focus.delete(key); sp.focus.set(key, existing);
    } else {
      if (sp.focus.size >= FOCUS_CAPACITY) {
        const oldestKey = sp.focus.keys().next().value;
        sp.focus.delete(oldestKey);
      }
      sp.focus.set(key, { value, touches: 1, lastTouched: now, confidence: 1.0, added: now });
    }
    sp.stats.focuses++;
    return { ok: true, focus: [...sp.focus].slice(-FOCUS_CAPACITY).map(([k, v]) => ({ key: k, ...v })) };
  }

  /** Decay confidence on all focus slots that haven't been touched recently. */
  beat(agentId, { decay = 0.382 } = {}) {
    const sp = this._ensure(agentId);
    const now = Date.now();
    let evicted = 0;
    for (const [k, v] of [...sp.focus]) {
      const minutesCold = (now - v.lastTouched) / 60000;
      if (minutesCold < 1) continue;
      v.confidence *= decay;
      if (v.confidence < 0.05) { sp.focus.delete(k); evicted++; }
    }
    return { ok: true, evicted, remaining: sp.focus.size };
  }

  scratch(agentId, key, value, { ttl = SCRATCH_TTL_MS } = {}) {
    const sp = this._ensure(agentId);
    const now = Date.now();
    sp.scratchpad.set(key, { value, added: now, reads: 0, expiresAt: now + ttl, eligible: false });
    sp.stats.scratches++;
    return { ok: true, key, expiresAt: now + ttl };
  }

  readScratch(agentId, key) {
    const sp = this._ensure(agentId);
    const note = sp.scratchpad.get(key);
    if (!note) return { ok: false, reason: 'NOT_FOUND' };
    if (Date.now() > note.expiresAt) {
      sp.scratchpad.delete(key);
      return { ok: false, reason: 'EXPIRED' };
    }
    note.reads++;
    if (note.reads >= PROMOTE_THRESHOLD) note.eligible = true;
    return { ok: true, ...note };
  }

  /** Sweep expired scratchpad notes. Returns the keys removed. */
  sweep(agentId) {
    const sp = this._ensure(agentId);
    const now = Date.now();
    const expired = [];
    for (const [k, n] of [...sp.scratchpad]) {
      if (now > n.expiresAt) { sp.scratchpad.delete(k); expired.push(k); }
    }
    return { ok: true, expired_count: expired.length, expired };
  }

  /** Return scratchpad notes ready for vault promotion (read >= threshold). */
  promotable(agentId) {
    const sp = this._ensure(agentId);
    return [...sp.scratchpad].filter(([_, n]) => n.eligible)
      .map(([k, n]) => ({ key: k, value: n.value, reads: n.reads, added: n.added }));
  }

  view(agentId) {
    const sp = this._ensure(agentId);
    return {
      agent_id: agentId,
      focus: [...sp.focus].map(([k, v]) => ({ key: k, ...v })),
      scratchpad: [...sp.scratchpad].map(([k, v]) => ({ key: k, ...v })),
      stats: sp.stats,
    };
  }

  agents() {
    return [...this.spaces.keys()];
  }
}

/** @typedef {{focus:Map<string,object>,scratchpad:Map<string,object>,stats:object}} AgentSpace */
