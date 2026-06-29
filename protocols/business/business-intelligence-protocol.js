/**
 * PROTO-B007: Business Intelligence Protocol (BIP)
 * Derives from: WisdomDistilleryProtocol, MetaLearningProtocol, MultiModelFusionProtocol
 * Aggregates multi-platform data into a unified business intelligence digest.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class BusinessIntelligenceProtocol {
  constructor(config = {}) {
    this.version     = '1.0.0';
    this.domain      = 'business';
    this.kpiWeights  = config.kpiWeights ?? { revenue: PHI, growth: 1, retention: PHI_INV };
    this.metrics     = { digests: 0, kpisTracked: 0, alertsGenerated: 0 };
  }

  /**
   * Generate a unified BI digest from multi-platform data.
   * @param {{
   *   platforms: Record<string, { revenue: number, orders: number, customers: number, growth?: number }>,
   *   period: string,
   * }} data
   * @returns {{ digest: object, kpis: object, alerts: string[], score: number }}
   */
  digest(data) {
    const { platforms = {}, period = 'unknown' } = data;
    const platformNames = Object.keys(platforms);

    const totals = {
      revenue:    0,
      orders:     0,
      customers:  0,
      platforms:  platformNames.length,
    };

    const breakdown = {};
    for (const [name, d] of Object.entries(platforms)) {
      totals.revenue   += d.revenue   ?? 0;
      totals.orders    += d.orders    ?? 0;
      totals.customers += d.customers ?? 0;
      breakdown[name]   = {
        revenue:   d.revenue   ?? 0,
        orders:    d.orders    ?? 0,
        customers: d.customers ?? 0,
        aov:       d.orders > 0 ? (d.revenue / d.orders) : 0,
        share:     0,  // filled below
      };
    }

    // Revenue share per platform
    for (const name of platformNames) {
      breakdown[name].share = totals.revenue > 0 ? breakdown[name].revenue / totals.revenue : 0;
    }

    const kpis   = this.#computeKPIs(totals, platforms);
    const alerts = this.#generateAlerts(kpis, breakdown);
    const score  = this.#healthScore(kpis);

    this.metrics.digests++;
    this.metrics.kpisTracked    += Object.keys(kpis).length;
    this.metrics.alertsGenerated += alerts.length;

    return {
      digest: { period, totals, breakdown, generatedAt: new Date().toISOString() },
      kpis,
      alerts,
      score: Math.round(score * 1000) / 1000,
    };
  }

  /**
   * Compare two digest periods and compute delta.
   * @param {object} current
   * @param {object} previous
   * @returns {object}
   */
  compare(current, previous) {
    const delta = {};
    for (const key of Object.keys(current.digest?.totals ?? {})) {
      const curr = current.digest.totals[key]  ?? 0;
      const prev = previous.digest.totals[key] ?? 0;
      delta[key] = { current: curr, previous: prev, change: curr - prev, pct: prev !== 0 ? (curr - prev) / prev : 0 };
    }
    return { delta, period: `${previous.digest.period} → ${current.digest.period}` };
  }

  #computeKPIs(totals, platforms) {
    const aov      = totals.orders > 0 ? totals.revenue / totals.orders : 0;
    const cpv      = totals.customers > 0 ? totals.revenue / totals.customers : 0;
    const growthValues = Object.values(platforms).map((d) => d.growth ?? 0).filter(Boolean);
    const avgGrowth = growthValues.length > 0
      ? growthValues.reduce((a, b) => a + b, 0) / growthValues.length
      : 0;

    return { totalRevenue: totals.revenue, totalOrders: totals.orders, totalCustomers: totals.customers, aov, cpv, avgGrowth };
  }

  #generateAlerts(kpis, breakdown) {
    const alerts = [];
    if (kpis.avgGrowth < 0)             alerts.push('Overall growth is negative — review platform strategies');
    if (kpis.aov < 10)                  alerts.push('Average order value is low — consider upsell strategies');
    const maxShare = Math.max(...Object.values(breakdown).map((b) => b.share));
    if (maxShare > 0.8)                 alerts.push(`Platform concentration risk — one platform holds ${(maxShare * 100).toFixed(0)}% of revenue`);
    return alerts;
  }

  #healthScore(kpis) {
    const growthScore   = Math.max(0, Math.min(1, 1 + kpis.avgGrowth));
    const revenueScore  = kpis.totalRevenue > 0 ? PHI_INV : 0;
    return growthScore * this.kpiWeights.growth + revenueScore * this.kpiWeights.revenue;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default BusinessIntelligenceProtocol;
