/**
 * PROTO-B005: Revenue Forecast Protocol (RFP)
 * Derives from: PredictiveCodingProtocol, TemporalEngineProtocol
 * Multi-horizon revenue forecasting with phi-weighted exponential smoothing.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class RevenueForecastProtocol {
  constructor(config = {}) {
    this.version   = '1.0.0';
    this.domain    = 'business';
    this.alpha     = config.alpha     ?? PHI_INV ** 2;  // smoothing factor ≈ 0.382
    this.horizons  = config.horizons  ?? [7, 30, 90];   // forecast days
    this.metrics   = { forecasts: 0, totalMAPE: 0, avgMAPE: 0 };
    this.#ema      = null;
    this.#history  = [];
  }

  #ema;
  #history;

  /**
   * Feed a new revenue observation and return forecasts for all horizons.
   * @param {{ date: string, revenue: number, platform?: string }} observation
   * @returns {{ ema: number, forecasts: Record<string, number>, confidence: number }}
   */
  observe(observation) {
    const r = observation.revenue;
    this.#history.push(r);
    if (this.#history.length > 365) this.#history.shift();

    // Phi-weighted EMA
    this.#ema = this.#ema === null
      ? r
      : this.alpha * r + (1 - this.alpha) * this.#ema;

    const forecasts = {};
    for (const h of this.horizons) {
      forecasts[`${h}d`] = this.#forecastHorizon(h);
    }

    this.metrics.forecasts++;
    const confidence = Math.min(1, this.#history.length / 30);
    return { ema: Math.round(this.#ema * 100) / 100, forecasts, confidence };
  }

  /**
   * Batch-train from historical data then forecast.
   * @param {{ date: string, revenue: number }[]} history
   * @returns {{ ema: number, forecasts: object, confidence: number }}
   */
  trainAndForecast(history = []) {
    this.#ema     = null;
    this.#history = [];
    let last;
    for (const obs of history) {
      last = this.observe(obs);
    }
    return last ?? { ema: 0, forecasts: {}, confidence: 0 };
  }

  /**
   * Evaluate forecast accuracy against actuals (MAPE).
   * @param {number} forecasted
   * @param {number} actual
   * @returns {number} MAPE for this observation
   */
  evaluateAccuracy(forecasted, actual) {
    const mape = actual !== 0 ? Math.abs((actual - forecasted) / actual) : 0;
    const n    = this.metrics.forecasts;
    this.metrics.totalMAPE += mape;
    this.metrics.avgMAPE    = n > 0 ? this.metrics.totalMAPE / n : 0;
    return mape;
  }

  #forecastHorizon(days) {
    if (!this.#ema) return 0;
    const trend = this.#trend();
    // Compound growth with phi-dampened long-range decay
    const dampened = trend ** (days * PHI_INV);
    return Math.round(this.#ema * dampened * 100) / 100;
  }

  #trend() {
    const h = this.#history;
    if (h.length < 2) return 1;
    const recent = h.slice(-7);
    const older  = h.slice(-14, -7);
    if (older.length === 0) return 1;
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgOlder  = older.reduce( (a, b) => a + b, 0) / older.length;
    return avgOlder > 0 ? avgRecent / avgOlder : 1;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default RevenueForecastProtocol;
