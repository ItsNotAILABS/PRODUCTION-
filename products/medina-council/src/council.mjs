// council.mjs — Sovereign multi-AI consensus engine.
// Solfeggio-frequency-derived role weights. Sovereign veto. φ-aware
// confidence floor. Dissent surfaced, never silenced.
//
// Derived from ItsNotAILABS consensus-engine (MIT).

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

/**
 * Role weights anchored to the Solfeggio authority scale.
 * SOVEREIGN holds 1.00 (veto when below confidence floor).
 */
export const DEFAULT_ROLE_WEIGHTS = Object.freeze({
  SOVEREIGN:      1.00,
  LEAD:           0.85,
  SYNTHESIZER:    0.80,
  CRITIC:         0.75,
  ANALYST:        0.70,
  GUARDIAN:       0.70,
  DOMAIN_EXPERT:  0.65,
  BUILDER:        0.60,
  MEMORY_CURATOR: 0.55,
  RESEARCHER:     0.50,
});

export const DEFAULTS = Object.freeze({
  threshold:        PHI_INV,   // 0.618 — must clear φ⁻¹ to pass
  confidenceFloor:  0.40,      // votes below this don't count
  vetoRoles:        ['SOVEREIGN'],
  fallbackWeight:   0.5,
});

// ── State container ─────────────────────────────────────────────────────

export class Council {
  constructor(opts = {}) {
    this.threshold       = opts.threshold       ?? DEFAULTS.threshold;
    this.confidenceFloor = opts.confidenceFloor ?? DEFAULTS.confidenceFloor;
    this.vetoRoles       = new Set(opts.vetoRoles ?? DEFAULTS.vetoRoles);
    this.roleWeights     = { ...DEFAULT_ROLE_WEIGHTS, ...(opts.roleWeights ?? {}) };
    /** @type {Map<string, {taskId, prompt, openedAt, votes:Array, result:?}>} */
    this.tasks = new Map();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  open(taskId, prompt, openedBy) {
    if (typeof taskId !== 'string' || !taskId) return { ok: false, reason: 'TASK_ID_REQUIRED' };
    if (this.tasks.has(taskId))                 return { ok: false, reason: 'TASK_ALREADY_OPEN' };
    this.tasks.set(taskId, {
      taskId, prompt: String(prompt ?? ''),
      openedBy, openedAt: Date.now(),
      votes: [], result: null,
    });
    return { ok: true, taskId, openedAt: Date.now() };
  }

  // ── Voting ──────────────────────────────────────────────────────────

  vote({ taskId, agentId, role, content, confidence, reasoning }) {
    const t = this.tasks.get(taskId);
    if (!t)                                       return { ok: false, reason: 'TASK_NOT_FOUND' };
    if (t.result)                                 return { ok: false, reason: 'TASK_ALREADY_RESOLVED' };
    if (typeof agentId !== 'string' || !agentId)  return { ok: false, reason: 'AGENT_ID_REQUIRED' };
    if (typeof role    !== 'string' || !role)     return { ok: false, reason: 'ROLE_REQUIRED' };
    if (typeof confidence !== 'number' ||
        confidence < 0 || confidence > 1)         return { ok: false, reason: 'CONFIDENCE_RANGE_0_1' };

    // Idempotent by (taskId, agentId) — last vote wins.
    const idx = t.votes.findIndex(v => v.agentId === agentId);
    const vote = { agentId, role, content, confidence,
                   reasoning: reasoning ?? null, ts: Date.now() };
    if (idx >= 0) t.votes[idx] = vote;
    else          t.votes.push(vote);
    return { ok: true, taskId, agentId, totalVotes: t.votes.length };
  }

  // ── Resolution ──────────────────────────────────────────────────────

  resolve(taskId) {
    const t = this.tasks.get(taskId);
    if (!t)        return { ok: false, reason: 'TASK_NOT_FOUND' };
    if (t.result)  return { ok: true,  cached: true, ...t.result };
    if (t.votes.length === 0)
      return { ok: false, reason: 'NO_VOTES' };

    let totalWeight = 0, approveWeight = 0, rejectWeight = 0;
    const resolved = [], dissent = [];
    let vetoed = false, winner = null;

    for (const v of t.votes) {
      const rw = this.roleWeights[v.role] ?? DEFAULTS.fallbackWeight;
      const score = rw * v.confidence;
      const counted = v.confidence >= this.confidenceFloor;
      const rv = { ...v, roleWeight: rw, weightedScore: score, counted };
      resolved.push(rv);
      totalWeight += rw;

      if (!counted) {
        dissent.push(rv);
        rejectWeight += score;
        if (this.vetoRoles.has(v.role)) vetoed = true;
        continue;
      }
      approveWeight += score;
      if (!winner || score > winner.weightedScore) winner = rv;
    }

    const approvalRatio = totalWeight > 0 ? approveWeight / totalWeight : 0;
    const approved = !vetoed && approvalRatio >= this.threshold;

    const result = {
      taskId, votes: resolved, approved, vetoed,
      totalWeight, approveWeight, rejectWeight,
      threshold: this.threshold,
      approvalRatio: Math.round(approvalRatio * 10000) / 10000,
      winner, dissent,
      resolvedAt: Date.now(),
    };
    t.result = result;
    return { ok: true, ...result };
  }

  // ── Queries ─────────────────────────────────────────────────────────

  list({ status } = {}) {
    const out = [];
    for (const t of this.tasks.values()) {
      const state = t.result ? (t.result.approved ? 'APPROVED'
                              : t.result.vetoed   ? 'VETOED'
                              : 'REJECTED') : 'OPEN';
      if (status && status !== state) continue;
      out.push({
        taskId: t.taskId, state,
        openedAt: t.openedAt, openedBy: t.openedBy,
        votes: t.votes.length,
        prompt: t.prompt.slice(0, 160),
      });
    }
    return out;
  }

  status() {
    const counts = { OPEN: 0, APPROVED: 0, VETOED: 0, REJECTED: 0 };
    for (const t of this.tasks.values()) {
      if (!t.result) counts.OPEN++;
      else if (t.result.approved) counts.APPROVED++;
      else if (t.result.vetoed)   counts.VETOED++;
      else                         counts.REJECTED++;
    }
    return {
      total: this.tasks.size,
      ...counts,
      threshold: this.threshold,
      confidenceFloor: this.confidenceFloor,
      vetoRoles: [...this.vetoRoles],
    };
  }
}
