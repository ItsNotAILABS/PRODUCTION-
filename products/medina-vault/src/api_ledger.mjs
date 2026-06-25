// api_ledger.mjs — Per-route intelligent ledger. Every MCP tool call and
// HTTP gateway hit is recorded here. The ledger is self-aware: it can
// diagnose its own health, surface anomalies, and report top callers.
//
// "Every API routed to its ledger. The API itself is intelligent." — Operator

class RouteLedger {
  constructor(route) {
    this.route = route;
    this._calls = [];
    this.calls_total = 0;
    this.calls_ok = 0;
    this.calls_fail = 0;
    this._total_ms = 0;
  }

  record({ agent_id = 'unknown', ok, ms = 0, error = null } = {}) {
    this.calls_total++;
    if (ok) this.calls_ok++; else this.calls_fail++;
    this._total_ms += ms;
    this._calls.push({ ts: Date.now(), agent_id, ok, ms, error: error ?? null });
    if (this._calls.length > 500) this._calls.shift();
  }

  stats() {
    const sorted = [...this._calls].map(c => c.ms).sort((a, b) => a - b);
    const p = (pct) => sorted.length ? (sorted[Math.floor(sorted.length * pct)] ?? 0) : 0;
    const agents = {}, errors = {};
    for (const c of this._calls) {
      agents[c.agent_id] = (agents[c.agent_id] || 0) + 1;
      if (c.error) errors[c.error] = (errors[c.error] || 0) + 1;
    }
    return {
      route: this.route,
      calls_total: this.calls_total,
      calls_ok: this.calls_ok,
      calls_fail: this.calls_fail,
      error_rate: this.calls_total > 0 ? +(this.calls_fail / this.calls_total).toFixed(4) : 0,
      avg_ms: this.calls_total > 0 ? Math.round(this._total_ms / this.calls_total) : 0,
      p50_ms: p(0.5), p95_ms: p(0.95), p99_ms: p(0.99),
      top_callers: Object.entries(agents).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([agent_id, calls]) => ({ agent_id, calls })),
      top_errors: Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([error, count]) => ({ error, count })),
    };
  }

  health() {
    const s = this.stats();
    let status = 'HEALTHY';
    if (s.error_rate > 0.5)       status = 'CRITICAL';
    else if (s.error_rate > 0.2)  status = 'DEGRADED';
    else if (s.error_rate > 0.05) status = 'WARNING';
    return { route: s.route, status, error_rate: s.error_rate, avg_ms: s.avg_ms,
             p95_ms: s.p95_ms, calls_total: s.calls_total };
  }

  /** Self-description: the route knows its own state in plain text. */
  describe() {
    const s = this.stats();
    const h = this.health();
    const lines = [
      `${s.route} · ${h.status}`,
      `  calls: ${s.calls_total} total · ${s.calls_ok} ok · ${s.calls_fail} fail (${(s.error_rate*100).toFixed(1)}% error)`,
      `  latency: avg=${s.avg_ms}ms  p50=${s.p50_ms}ms  p95=${s.p95_ms}ms  p99=${s.p99_ms}ms`,
    ];
    if (s.top_callers.length)
      lines.push(`  callers: ${s.top_callers.map(c => `${c.agent_id}(${c.calls})`).join(', ')}`);
    if (s.top_errors.length)
      lines.push(`  errors: ${s.top_errors.map(e => `${e.error}(${e.count})`).join(', ')}`);
    return lines.join('\n');
  }
}

export class ApiLedger {
  constructor() {
    this._routes = new Map();
    this._boot_ts = Date.now();
  }

  /** Auto-creates a RouteLedger on first access. */
  route(name) {
    if (!this._routes.has(name)) this._routes.set(name, new RouteLedger(name));
    return this._routes.get(name);
  }

  /**
   * Wrap an async function with automatic latency + ok/fail recording.
   * Usage: const result = await apiLedger.measure('tool_name', agent_id, () => handler(args));
   */
  async measure(route_name, agent_id, fn) {
    const t0 = Date.now();
    let out;
    try {
      out = await fn();
      this.route(route_name).record({ agent_id, ok: out?.ok !== false, ms: Date.now() - t0 });
      return out;
    } catch (err) {
      this.route(route_name).record({ agent_id, ok: false, ms: Date.now() - t0, error: err.message?.slice(0, 80) });
      throw err;
    }
  }

  listRoutes() { return [...this._routes.keys()].sort(); }

  routeStats(name) {
    const r = this._routes.get(name);
    return r ? r.stats() : { ok: false, reason: 'ROUTE_NOT_FOUND', available: this.listRoutes() };
  }

  allStats() {
    return [...this._routes.values()]
      .map(r => r.stats())
      .sort((a, b) => b.calls_total - a.calls_total);
  }

  allHealth() {
    return [...this._routes.values()]
      .map(r => r.health())
      .sort((a, b) => {
        const order = { CRITICAL: 0, DEGRADED: 1, WARNING: 2, HEALTHY: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      });
  }

  /**
   * Intelligence layer — synthesize what needs attention across all routes.
   * Returns a structured assessment with signal-to-noise priority ordering.
   */
  intelligence() {
    const all = this.allStats();
    const health = this.allHealth();
    const critical  = health.filter(r => r.status === 'CRITICAL');
    const degraded  = health.filter(r => r.status === 'DEGRADED');
    const warning   = health.filter(r => r.status === 'WARNING');
    const busiest   = [...all].sort((a, b) => b.calls_total - a.calls_total).slice(0, 5);
    const slowest   = [...all].filter(r => r.calls_total > 0)
      .sort((a, b) => b.p95_ms - a.p95_ms).slice(0, 5);
    const total     = all.reduce((s, r) => s + r.calls_total, 0);
    const total_ok  = all.reduce((s, r) => s + r.calls_ok, 0);
    const overall_err = total > 0 ? (total - total_ok) / total : 0;

    const assessment = critical.length > 0
      ? `${critical.length} route(s) CRITICAL — immediate investigation required: ${critical.map(r=>r.route).join(', ')}`
      : degraded.length > 0
        ? `${degraded.length} route(s) DEGRADED — monitor: ${degraded.map(r=>r.route).join(', ')}`
        : warning.length > 0
          ? `${warning.length} route(s) at WARNING — watchlist: ${warning.map(r=>r.route).join(', ')}`
          : total === 0
            ? 'No calls recorded yet'
            : 'All routes operating normally';

    return {
      ok: true,
      uptime_ms: Date.now() - this._boot_ts,
      routes_tracked: all.length,
      total_calls: total,
      total_ok,
      overall_error_rate: +overall_err.toFixed(4),
      critical_routes:  critical.map(r => r.route),
      degraded_routes:  degraded.map(r => r.route),
      warning_routes:   warning.map(r => r.route),
      busiest_routes:   busiest.map(r => ({ route: r.route, calls: r.calls_total })),
      slowest_p95:      slowest.map(r => ({ route: r.route, p95_ms: r.p95_ms })),
      assessment,
    };
  }
}
