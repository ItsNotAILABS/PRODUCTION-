/**
 * PROTO-B001: Sales Intelligence Protocol (SIP)
 * Derives from: PatternSynthesisProtocol, MultiModelFusionProtocol, TemporalEngineProtocol
 * Detects sales patterns, forecasts trends, and scores opportunity windows using phi-math timing.
 */

const PHI    = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT = 873;

export class SalesIntelligenceProtocol {
  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'business';
    this.windowSize    = config.windowSize   ?? 30;   // days
    this.minSamples    = config.minSamples   ?? 5;
    this.phiThreshold  = config.phiThreshold ?? PHI_INV;

    this.patterns      = new Map();   // period → pattern
    this.forecasts     = [];
    this.metrics       = { analyzed: 0, patternsFound: 0, forecastAccuracy: 0 };
  }

  /**
   * Analyze a sales dataset and extract intelligence.
   * @param {{ date: string, revenue: number, units: number, platform?: string }[]} transactions
   * @returns {{ patterns: object[], forecast: object, insights: string[], score: number }}
   */
  analyze(transactions = []) {
    if (transactions.length < this.minSamples) {
      return { patterns: [], forecast: null, insights: ['Insufficient data for analysis'], score: 0 };
    }

    this.metrics.analyzed += transactions.length;

    const byPeriod  = this.#groupByPeriod(transactions);
    const patterns  = this.#extractPatterns(byPeriod);
    const forecast  = this.#forecast(byPeriod);
    const insights  = this.#generateInsights(patterns, forecast);
    const score     = this.#opportunityScore(patterns, forecast);

    this.patterns   = new Map(patterns.map((p) => [p.period, p]));
    this.forecasts.push(forecast);
    this.metrics.patternsFound += patterns.length;

    return { patterns, forecast, insights, score };
  }

  /**
   * Score a given platform's sales velocity relative to the ensemble.
   * @param {string} platform
   * @param {number} currentRevenue
   * @returns {{ velocity: number, trend: 'up'|'flat'|'down', confidence: number }}
   */
  scoreVelocity(platform, currentRevenue) {
    const pattern = [...this.patterns.values()].find((p) => p.platform === platform);
    if (!pattern) return { velocity: 0, trend: 'flat', confidence: 0 };
    const velocity   = currentRevenue / (pattern.avgRevenue || 1);
    const trend      = velocity > PHI ? 'up' : velocity < PHI_INV ? 'down' : 'flat';
    const confidence = Math.min(1, pattern.samples / this.windowSize);
    return { velocity, trend, confidence };
  }

  #groupByPeriod(txs) {
    const byWeek = new Map();
    for (const tx of txs) {
      const d    = new Date(tx.date);
      const week = `${d.getFullYear()}-W${Math.ceil((d.getDate()) / 7)}`;
      if (!byWeek.has(week)) byWeek.set(week, { revenue: 0, units: 0, count: 0 });
      const b = byWeek.get(week);
      b.revenue += tx.revenue ?? 0;
      b.units   += tx.units   ?? 0;
      b.count++;
    }
    return byWeek;
  }

  #extractPatterns(byPeriod) {
    const periods = [...byPeriod.entries()];
    if (periods.length < 2) return [];
    const revenues = periods.map(([, v]) => v.revenue);
    const avg      = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    const stdDev   = Math.sqrt(revenues.reduce((a, b) => a + (b - avg) ** 2, 0) / revenues.length);

    return periods.map(([period, data]) => ({
      period,
      avgRevenue: avg,
      samples:    data.count,
      zScore:     stdDev > 0 ? (data.revenue - avg) / stdDev : 0,
      strength:   Math.abs(data.revenue - avg) / (avg || 1),
      phiAligned: Math.abs(data.revenue / (avg || 1) - PHI) < 0.1,
    }));
  }

  #forecast(byPeriod) {
    const values = [...byPeriod.values()].map((v) => v.revenue);
    if (values.length < 2) return { nextPeriod: 0, confidence: 0 };
    const last    = values[values.length - 1];
    const prev    = values[values.length - 2];
    const trend   = last / (prev || 1);
    const nextPeriod = last * (trend > 1 ? PHI_INV * trend : trend);
    return {
      nextPeriod: Math.round(nextPeriod * 100) / 100,
      trend,
      confidence: Math.min(1, values.length / this.windowSize),
      forecastedAt: new Date().toISOString(),
    };
  }

  #generateInsights(patterns, forecast) {
    const insights = [];
    const phiAligned = patterns.filter((p) => p.phiAligned);
    if (phiAligned.length > 0) insights.push(`${phiAligned.length} phi-resonant sales periods detected`);
    if (forecast?.trend > PHI) insights.push(`Strong growth trajectory — ${((forecast.trend - 1) * 100).toFixed(1)}% above baseline`);
    if (forecast?.trend < PHI_INV) insights.push('Declining trend detected — intervention recommended');
    if (patterns.some((p) => p.zScore > 2)) insights.push('Significant positive anomaly detected — investigate for replication');
    return insights;
  }

  #opportunityScore(patterns, forecast) {
    const base = forecast?.trend ?? 1;
    const phiBonus = patterns.filter((p) => p.phiAligned).length * 0.1;
    return Math.min(1, (base * PHI_INV + phiBonus));
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export const SALES_INTEL_VERSION = '1.0.0';
export default SalesIntelligenceProtocol;
