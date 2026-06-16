// budget.mjs — token & API-call budget per session/agent.
//
// PROBLEM: AIs burn budget on redundant work because they have no visibility
// into what they've already spent in a session. Loom tracks it so the AI can
// check, throttle, or hand off when approaching a cap.
//
// Tracks two budgets per agent:
//   tool_calls   — number of MCP tool invocations
//   estimated_tokens — rough token estimate from input + output payload sizes
//
// Set caps via budget_set; check via budget_check; report via budget_view.

const TOK_PER_CHAR = 0.25; // rough conservative estimate

export class BudgetTracker {
  constructor() {
    /** @type {Map<string, BudgetState>} */
    this.budgets = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.budgets) return;
    for (const [a, s] of Object.entries(meta.budgets)) this.budgets.set(a, s);
  }
  toMeta() {
    return { budgets: Object.fromEntries(this.budgets) };
  }

  _state(agent) {
    if (!this.budgets.has(agent)) {
      this.budgets.set(agent, {
        tool_calls: 0, estimated_tokens: 0,
        cap_tool_calls: null, cap_estimated_tokens: null,
        sessions: 0, started: Date.now(), last_event: Date.now(),
        by_skill: {},
      });
    }
    return this.budgets.get(agent);
  }

  setCap(agent, { tool_calls, estimated_tokens } = {}) {
    const s = this._state(agent);
    if (tool_calls       != null) s.cap_tool_calls       = tool_calls;
    if (estimated_tokens != null) s.cap_estimated_tokens = estimated_tokens;
    return { ok: true, agent, caps: { tool_calls: s.cap_tool_calls, estimated_tokens: s.cap_estimated_tokens } };
  }

  /** Record a tool invocation and its rough token cost. */
  record(agent, skill, { input, output }) {
    const s = this._state(agent);
    s.tool_calls++;
    const sizeIn  = input  != null ? JSON.stringify(input).length  : 0;
    const sizeOut = output != null ? JSON.stringify(output).length : 0;
    const est = Math.ceil((sizeIn + sizeOut) * TOK_PER_CHAR);
    s.estimated_tokens += est;
    s.last_event = Date.now();
    s.by_skill[skill] = (s.by_skill[skill] || 0) + 1;
    return { ok: true, est_tokens_for_call: est, total: s.estimated_tokens, tool_calls: s.tool_calls };
  }

  startSession(agent) {
    const s = this._state(agent);
    s.sessions++;
    return { ok: true, agent, session_number: s.sessions };
  }

  /** Returns { ok, within_budget, percent_used }. */
  check(agent) {
    const s = this._state(agent);
    const calls_pct = s.cap_tool_calls       ? s.tool_calls       / s.cap_tool_calls       : 0;
    const toks_pct  = s.cap_estimated_tokens ? s.estimated_tokens / s.cap_estimated_tokens : 0;
    const pct = Math.max(calls_pct, toks_pct);
    return {
      ok: true, agent,
      within_budget: pct < 1,
      tool_calls: s.tool_calls,    cap_tool_calls: s.cap_tool_calls,
      estimated_tokens: s.estimated_tokens, cap_estimated_tokens: s.cap_estimated_tokens,
      percent_used: Math.round(pct * 1000) / 1000,
      warning: pct >= 0.8 && pct < 1 ? 'APPROACHING_CAP'
             : pct >= 1            ? 'OVER_CAP' : null,
    };
  }

  view(agent) {
    const s = this._state(agent);
    const topSkills = Object.entries(s.by_skill).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { ok: true, agent, ...s, top_skills: topSkills };
  }

  reset(agent) {
    const s = this._state(agent);
    s.tool_calls = 0;
    s.estimated_tokens = 0;
    s.by_skill = {};
    return { ok: true, agent, reset_at: Date.now() };
  }
}

/** @typedef {{tool_calls:number, estimated_tokens:number, cap_tool_calls:number|null, cap_estimated_tokens:number|null, sessions:number, by_skill:object}} BudgetState */
