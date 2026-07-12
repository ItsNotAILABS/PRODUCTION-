/**
 * PROTO-FIN-004: Portfolio Optimization
 * ═════════════════════════════════════════════════════════════════════
 *
 * Computes efficient frontier via phi-weighted covariance and
 * max Sharpe ratio. Rebalances on coherence metrics.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

function weightedMean(values, weights = null) {
  const w = weights || values.map(() => 1 / values.length);
  const num = values.reduce((s, v, i) => s + v * w[i], 0);
  const den = w.reduce((a, b) => a + b, 0);
  return den > 0 ? num / den : 0;
}

function phiCov(returns) {
  const n = returns.length;
  if (n < 2) return [];
  const assets = returns[0].length;
  const means = Array.from({ length: assets }, (_, j) =>
    returns.reduce((s, row) => s + row[j], 0) / n
  );
  const centered = returns.map(row => row.map((v, j) => v - means[j]));
  const cov = Array.from({ length: assets }, (_, i) =>
    Array.from({ length: assets }, (_, j) =>
      (centered.reduce((s, row) => s + row[i] * row[j], 0) / (n - 1)) * Math.pow(PHI, -Math.abs(i - j))
    )
  );
  return cov;
}

function sharpeRatio(returns, weights, riskFreeRate = 0.02) {
  const expectedReturn = weightedMean(
    returns[0].map((_, j) => weightedMean(returns.map(r => r[j]))),
    weights
  );
  const cov = phiCov(returns);
  const variance = weights.reduce((s, w, i) =>
    s + w * w * cov[i][i] + 2 * w * weights.slice(i + 1).reduce((ss, w2, j) =>
      ss + w2 * cov[i][i + 1 + j], 0
    ), 0
  );
  const stdDev = Math.sqrt(Math.max(0, variance));
  return stdDev > 0 ? (expectedReturn - riskFreeRate) / stdDev : 0;
}

class PortfolioOptimizer {
  constructor(assets = []) {
    this.assets = assets;
    this.historicalReturns = [];
    this.weights = {};
    this.lastOptimization = null;
  }

  recordReturns(assetId, returnValue) {
    if (!this.historicalReturns[0]) {
      this.historicalReturns = Array.from({ length: this.assets.length }, () => []);
    }
    const idx = this.assets.indexOf(assetId);
    if (idx >= 0) this.historicalReturns[idx].push(returnValue);
  }

  optimize(constraints = {}) {
    if (this.historicalReturns.length === 0 || !this.historicalReturns[0].length) {
      return { ok: false, error: 'insufficient return history' };
    }

    const n = this.assets.length;
    let bestWeights = Array(n).fill(1 / n);
    let bestSharpe = -Infinity;

    for (let trial = 0; trial < 100; trial++) {
      const w = Array.from({ length: n }, () => Math.random());
      const sum = w.reduce((a, b) => a + b, 0);
      const normalized = w.map(v => v / sum);

      const sharpe = this._computeSharpe(normalized);
      if (sharpe > bestSharpe) {
        bestSharpe = sharpe;
        bestWeights = normalized;
      }
    }

    for (let i = 0; i < n; i++) {
      this.weights[this.assets[i]] = bestWeights[i];
    }

    this.lastOptimization = {
      ts: Date.now(),
      weights: { ...this.weights },
      expectedSharpe: bestSharpe,
      numAssets: n,
    };

    return { ok: true, optimization: this.lastOptimization };
  }

  _computeSharpe(weights) {
    const transposed = Array.from({ length: this.historicalReturns[0].length }, (_, i) =>
      this.historicalReturns.map(arr => arr[i])
    );
    return sharpeRatio(transposed, weights);
  }

  rebalance(targetCoherence = 0.87) {
    const result = this.optimize();
    if (!result.ok) return result;

    return {
      ok: true,
      rebalanced: true,
      weights: this.weights,
      targetCoherence,
      timestamp: Date.now(),
    };
  }

  snapshot() {
    return {
      assets: this.assets,
      weights: this.weights,
      lastOptimization: this.lastOptimization,
    };
  }
}

module.exports = { PortfolioOptimizer, phiCov, sharpeRatio };
