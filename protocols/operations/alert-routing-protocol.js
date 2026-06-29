/**
 * PROTO-O002: Alert Routing Protocol (ARP)
 * Derives from: AttentionRoutingProtocol, SwarmIntelligenceProtocol
 * Intelligent alert classification, deduplication, and priority dispatch.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const SEVERITY = Object.freeze({
  INFO:     'info',
  WARNING:  'warning',
  ERROR:    'error',
  CRITICAL: 'critical',
});

export class AlertRoutingProtocol {
  constructor(config = {}) {
    this.version          = '1.0.0';
    this.domain           = 'operations';
    this.dedupWindowMs    = config.dedupWindowMs ?? 60_000;  // 1 min dedup window
    this.suppressionRules = config.suppressionRules ?? [];
    this.metrics          = { received: 0, routed: 0, deduplicated: 0, suppressed: 0 };
    this.#recentAlerts    = new Map();   // fingerprint → timestamp
    this.#routes          = new Map();   // severity → handler[]
  }

  #recentAlerts;
  #routes;

  /**
   * Register a routing target for a severity level.
   * @param {string} severity
   * @param {{ name: string, deliver: (alert: object) => void }} handler
   */
  registerRoute(severity, handler) {
    if (!this.#routes.has(severity)) this.#routes.set(severity, []);
    this.#routes.get(severity).push(handler);
  }

  /**
   * Process and route an alert.
   * @param {{ id?: string, source: string, severity: string, title: string, body?: string, tags?: string[], timestamp?: string }} alert
   * @returns {{ routed: boolean, reason: string, handlers: string[] }}
   */
  route(alert) {
    const enriched = { ...alert, timestamp: alert.timestamp ?? new Date().toISOString(), id: alert.id ?? this.#uid() };
    this.metrics.received++;

    // Dedup check
    const fp = this.#fingerprint(enriched);
    const last = this.#recentAlerts.get(fp);
    if (last && Date.now() - last < this.dedupWindowMs) {
      this.metrics.deduplicated++;
      return { routed: false, reason: 'deduplicated', handlers: [] };
    }

    // Suppression rules
    for (const rule of this.suppressionRules) {
      if (rule(enriched)) {
        this.metrics.suppressed++;
        return { routed: false, reason: 'suppressed', handlers: [] };
      }
    }

    // Escalation — CRITICAL alerts always get routed to higher severity handlers too
    const severities = this.#severityChain(enriched.severity);
    const handlerNames = [];

    for (const sev of severities) {
      for (const handler of (this.#routes.get(sev) ?? [])) {
        try { handler.deliver(enriched); handlerNames.push(handler.name); } catch { /* isolation */ }
      }
    }

    this.#recentAlerts.set(fp, Date.now());
    this.metrics.routed++;
    return { routed: true, reason: 'dispatched', handlers: handlerNames };
  }

  /**
   * Compute a priority score for ordering a queue of alerts.
   * @param {object} alert
   * @returns {number}
   */
  priorityScore(alert) {
    const sevWeight = { [SEVERITY.CRITICAL]: PHI ** 2, [SEVERITY.ERROR]: PHI, [SEVERITY.WARNING]: 1, [SEVERITY.INFO]: PHI_INV };
    const age       = (Date.now() - new Date(alert.timestamp ?? 0).getTime()) / 60_000;  // minutes
    return (sevWeight[alert.severity] ?? 1) * Math.pow(PHI_INV, age * 0.1);
  }

  #severityChain(severity) {
    const chain = { [SEVERITY.CRITICAL]: [SEVERITY.CRITICAL, SEVERITY.ERROR, SEVERITY.WARNING], [SEVERITY.ERROR]: [SEVERITY.ERROR, SEVERITY.WARNING], [SEVERITY.WARNING]: [SEVERITY.WARNING], [SEVERITY.INFO]: [SEVERITY.INFO] };
    return chain[severity] ?? [severity];
  }

  #fingerprint(alert) {
    return `${alert.source}:${alert.severity}:${alert.title}`;
  }

  #uid() { return `alert-${Date.now().toString(36)}`; }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default AlertRoutingProtocol;
