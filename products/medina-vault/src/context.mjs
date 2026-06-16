// context.mjs — session lifecycle + context snapshots.
//
// When I (the AI) "wake up" in a new session, I call session_open and get back
// the snapshot from the last session: what was in working memory, what plans
// are open, what receipts are unread. When I "go to sleep" (operator says we're
// done, or context is about to compact), I call session_close which writes a
// fresh snapshot. The next session reads that snapshot before anything else.
//
// Snapshots are append-only; we keep the last N (default 50).

import { createHash } from 'node:crypto';

export class ContextLog {
  constructor() {
    /** @type {Snapshot[]} */
    this.snapshots = [];
    this.maxSnapshots = 50;
  }

  loadFromMeta(meta) {
    if (!meta?.context_snapshots) return;
    this.snapshots = meta.context_snapshots.slice();
  }
  toMeta() { return { context_snapshots: this.snapshots.slice(-this.maxSnapshots) }; }

  /**
   * Snapshot of current session state. Caller gathers the live pieces and
   * passes them in; this log just stores + hashes.
   */
  snapshot({ session_id, summary, focus = [], active_plans = [], open_promises = [],
             recent_receipts = [], decisions = [], agent = 'claude' } = {}) {
    const ts = Date.now();
    const payload = { ts, session_id, summary, focus, active_plans, open_promises, recent_receipts, decisions, agent };
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex').slice(0, 16);
    const snap = { ...payload, hash };
    this.snapshots.push(snap);
    while (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    return { ok: true, snapshot: snap };
  }

  latest({ agent } = {}) {
    const filtered = agent ? this.snapshots.filter(s => s.agent === agent) : this.snapshots;
    return filtered[filtered.length - 1] ?? null;
  }

  list({ agent, limit = 10 } = {}) {
    const filtered = agent ? this.snapshots.filter(s => s.agent === agent) : this.snapshots;
    return filtered.slice(-limit).reverse().map(s => ({
      ts: s.ts, hash: s.hash, agent: s.agent,
      session_id: s.session_id,
      summary: s.summary?.slice(0, 240),
      focus_size: s.focus.length,
      active_plans: s.active_plans.length,
      open_promises: s.open_promises.length,
    }));
  }

  /** Mark a session opened. Returns previous snapshot for resume (or null). */
  open({ session_id, agent = 'claude' }) {
    const prev = this.latest({ agent });
    return {
      ok: true,
      session_id,
      resumed_from: prev?.hash ?? null,
      resumed_at: prev?.ts ?? null,
      summary: prev?.summary ?? null,
      focus: prev?.focus ?? [],
      active_plans: prev?.active_plans ?? [],
      open_promises: prev?.open_promises ?? [],
      decisions: prev?.decisions ?? [],
    };
  }

  /**
   * EFFICIENCY: resume the DELTA only. Returns what changed since `since_hash`
   * (a prior snapshot's hash). Lets the next session avoid reloading already-
   * known context. If since_hash is unknown, returns the full prior snapshot.
   */
  openDelta({ session_id, agent = 'claude', since_hash }) {
    const prev = this.latest({ agent });
    if (!prev) return { ok: true, session_id, resumed_from: null, delta: null };
    if (!since_hash || prev.hash === since_hash) {
      return { ok: true, session_id, resumed_from: prev.hash, no_change: prev.hash === since_hash, delta: null };
    }
    const base = this.snapshots.find(s => s.hash === since_hash && s.agent === agent);
    if (!base) {
      // Caller doesn't know our state; send the latest in full.
      return { ok: true, session_id, resumed_from: prev.hash, full: prev, delta: null };
    }
    const setOf = (arr, keyFn) => new Set(arr.map(keyFn));
    const baseFocus = setOf(base.focus || [], f => f.key);
    const basePlans = setOf(base.active_plans || [], p => p.id);
    const basePromises = new Set(base.open_promises || []);
    const baseDecisions = new Set(base.decisions || []);
    const delta = {
      added_focus:      (prev.focus || []).filter(f => !baseFocus.has(f.key)),
      removed_focus:    (base.focus || []).filter(f => !setOf(prev.focus || [], x => x.key).has(f.key)),
      new_plans:        (prev.active_plans || []).filter(p => !basePlans.has(p.id)),
      new_promises:     (prev.open_promises || []).filter(p => !basePromises.has(p)),
      resolved_promises:(base.open_promises || []).filter(p => !new Set(prev.open_promises || []).has(p)),
      new_decisions:    (prev.decisions || []).filter(d => !baseDecisions.has(d)),
      summary_changed:  base.summary !== prev.summary,
      summary:          prev.summary,
    };
    return { ok: true, session_id, resumed_from: prev.hash, since_hash, delta };
  }

  stats() {
    const byAgent = {};
    for (const s of this.snapshots) byAgent[s.agent] = (byAgent[s.agent] || 0) + 1;
    return {
      total: this.snapshots.length,
      by_agent: byAgent,
      latest_hash: this.snapshots[this.snapshots.length - 1]?.hash ?? null,
      latest_ts: this.snapshots[this.snapshots.length - 1]?.ts ?? null,
    };
  }
}

/** @typedef {{ts:number,session_id:string,summary:string,focus:object[],active_plans:object[],open_promises:object[],recent_receipts:object[],decisions:object[],agent:string,hash:string}} Snapshot */
