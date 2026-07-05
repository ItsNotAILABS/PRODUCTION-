/**
 * PROTO-FIN-003: Advanced Trading Signals
 * ═════════════════════════════════════════════════════════════════════
 *
 * Derives trading signals from multiple market data sources.
 * Implements mean reversion, momentum, volatility smile, and Kuramoto
 * coherence detection on price arrays.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const SIGNAL_TYPE = Object.freeze({
  MEAN_REVERSION: 'mean_reversion',
  MOMENTUM:       'momentum',
  VOLATILITY:     'volatility',
  COHERENCE:      'coherence',
  HARMONIC:       'harmonic',
});

function meanReversion(prices) {
  const n = prices.length;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const deviation = prices[n - 1] - mean;
  const stdDev = Math.sqrt(prices.reduce((a, p) => a + (p - mean) ** 2, 0) / n);
  const zscore = stdDev > 0 ? deviation / stdDev : 0;
  return { mean, deviation, zscore, signal: Math.tanh(zscore) };
}

function momentum(prices, window = 14) {
  if (prices.length < window + 1) return { momentum: 0, roc: 0 };
  const curr = prices[prices.length - 1];
  const prev = prices[prices.length - 1 - window];
  const mom = curr - prev;
  const roc = prev !== 0 ? (mom / prev) * 100 : 0;
  return { momentum: mom, roc, strength: Math.tanh(mom / Math.abs(prev || 1)) };
}

function volatility(prices, window = 20) {
  const n = Math.min(window, prices.length);
  if (n < 2) return { volatility: 0, smile: [] };
  const recent = prices.slice(-n);
  const mean = recent.reduce((a, b) => a + b, 0) / n;
  const variance = recent.reduce((a, p) => a + (p - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance);
  const smile = recent.map((p, i) => Math.pow(PHI, -(Math.abs(p - mean) / (vol || 1))));
  return { volatility: vol, smile, smileHarmony: smile.reduce((a, b) => a + b, 0) / n };
}

function kuramotoCoherence(prices, phases = null) {
  const n = prices.length;
  if (n < 2) return { r: 0, psi: 0 };
  const theta = phases || prices.map((p, i) => (i / n) * 2 * Math.PI);
  let sumCos = 0, sumSin = 0;
  for (const t of theta) {
    sumCos += Math.cos(t);
    sumSin += Math.sin(t);
  }
  const r = Math.hypot(sumCos / n, sumSin / n);
  const psi = Math.atan2(sumSin / n, sumCos / n);
  return { r, psi, coherent: r >= PHI_INV };
}

class TradingSignalAnalyzer {
  constructor() {
    this.signals = [];
    this._lastAnalysis = null;
  }

  analyze(prices, timestamps = null) {
    if (prices.length < 2) return { ok: false, error: 'need at least 2 prices' };

    const ts = timestamps || prices.map((_, i) => Date.now() - (prices.length - 1 - i) * 1000);
    const signals = {};

    signals.meanReversion = meanReversion(prices);
    signals.momentum = momentum(prices);
    signals.volatility = volatility(prices);
    signals.kuramoto = kuramotoCoherence(prices);

    const compositeSignal = (
      signals.meanReversion.signal * PHI +
      signals.momentum.strength +
      (signals.kuramoto.r * 2) +
      (1 - signals.volatility.volatility / Math.max(...prices))
    ) / 4;

    const record = {
      ts: Date.now(),
      priceCount: prices.length,
      currentPrice: prices[prices.length - 1],
      signals,
      composite: compositeSignal,
      tier: compositeSignal > PHI ? 'STRONG_BUY' : compositeSignal > 1 ? 'BUY' : compositeSignal < -1 ? 'SELL' : 'NEUTRAL',
    };

    this.signals.push(record);
    if (this.signals.length > 1000) this.signals.shift();
    this._lastAnalysis = record;

    return { ok: true, analysis: record };
  }

  getLastSignal() {
    return this._lastAnalysis;
  }

  snapshot() {
    return {
      totalAnalyses: this.signals.length,
      lastAnalysis: this._lastAnalysis,
      history: this.signals.slice(-10),
    };
  }
}

module.exports = { TradingSignalAnalyzer, SIGNAL_TYPE, meanReversion, momentum, volatility, kuramotoCoherence };
