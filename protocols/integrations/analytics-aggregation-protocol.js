/**
 * PROTO-I020: Analytics Aggregation Protocol (AAP)
 * Derives from: BusinessIntelligenceProtocol, PatternSynthesisProtocol
 * Cross-platform analytics with event tracking, aggregation, funnel analysis, and phi-weighted metric importance.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class AnalyticsAggregationProtocol {
  #events = []; // { platform, type, customerId, value, meta, ts }

  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'integrations';
    this.maxEvents     = config.maxEvents ?? 1_000_000;
    this.metrics       = { events: 0, aggregations: 0, funnels: 0 };
  }

  /** Track a single event. */
  track(event = {}) {
    if (this.#events.length >= this.maxEvents) this.#events.shift(); // ring buffer
    this.#events.push({ ...event, ts: event.ts ?? Date.now() });
    this.metrics.events++;
    return { tracked: true, total: this.#events.length };
  }

  /** Aggregate events across platforms within a time range. */
  aggregate({ platforms = [], metrics: metricNames = [], groupBy = null, fromTs = 0, toTs = Infinity } = {}) {
    const filtered = this.#filterEvents(platforms, fromTs, toTs);
    const groups   = groupBy ? this.#groupEvents(filtered, groupBy) : { _all: filtered };
    const result   = {};

    for (const [group, evts] of Object.entries(groups)) {
      result[group] = {};
      for (const metric of metricNames) {
        result[group][metric] = this.#computeMetric(evts, metric);
      }
      // phi-weighted importance score per group
      const count = evts.length;
      const totalValue = evts.reduce((s, e) => s + (e.value ?? 0), 0);
      result[group]._phiScore = parseFloat((count * PHI_INV + totalValue * PHI_INV * PHI_INV).toFixed(4));
    }

    this.metrics.aggregations++;
    return { fromTs, toTs, platforms, groupBy, data: result, eventCount: filtered.length };
  }

  /** Compute conversion funnel for ordered steps within a time range. */
  funnel(steps = [], fromTs = 0, toTs = Infinity) {
    const filtered = this.#filterEvents([], fromTs, toTs);
    const customerMap = new Map(); // customerId → Set of seen event types

    for (const evt of filtered) {
      if (!evt.customerId) continue;
      if (!customerMap.has(evt.customerId)) customerMap.set(evt.customerId, new Set());
      customerMap.get(evt.customerId).add(evt.type);
    }

    const funnelData = [];
    let prevCount = customerMap.size;
    for (let i = 0; i < steps.length; i++) {
      const step     = steps[i];
      const qualified = [...customerMap.values()].filter((seen) => {
        return steps.slice(0, i + 1).every((s) => seen.has(s));
      }).length;
      const rate      = prevCount > 0 ? parseFloat((qualified / prevCount).toFixed(4)) : 0;
      const phiWeight = parseFloat((PHI_INV ** (i + 1)).toFixed(6));
      funnelData.push({ step, qualified, conversionRate: rate, phiWeight });
      prevCount = qualified;
    }

    this.metrics.funnels++;
    return { steps, stages: funnelData, totalCustomers: customerMap.size };
  }

  #filterEvents(platforms, fromTs, toTs) {
    return this.#events.filter((e) => {
      if (e.ts < fromTs || e.ts > toTs) return false;
      if (platforms.length && !platforms.includes(e.platform)) return false;
      return true;
    });
  }

  #groupEvents(events, groupBy) {
    const groups = {};
    for (const evt of events) {
      const key = evt[groupBy] ?? 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    }
    return groups;
  }

  #computeMetric(events, metric) {
    const values = events.map((e) => e.value ?? 0);
    switch (metric) {
      case 'count':   return events.length;
      case 'sum':     return parseFloat(values.reduce((a, b) => a + b, 0).toFixed(4));
      case 'avg':     return values.length ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : 0;
      case 'max':     return values.length ? Math.max(...values) : 0;
      case 'min':     return values.length ? Math.min(...values) : 0;
      case 'unique':  return new Set(events.map((e) => e.customerId).filter(Boolean)).size;
      default:        return null;
    }
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default AnalyticsAggregationProtocol;
