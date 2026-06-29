/**
 * PROTO-B004: Fraud Detection Protocol (FDP)
 * Derives from: CyberDefenseProtocol, AnomalyDetection, SwarmIntelligenceProtocol
 * Multi-signal anomaly scoring for transaction fraud using phi-weighted risk model.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const RISK_LEVELS = Object.freeze({
  SAFE:     'safe',       // score < 0.3
  ELEVATED: 'elevated',  // 0.3 – 0.6
  HIGH:     'high',      // 0.6 – 0.8
  CRITICAL: 'critical',  // > 0.8
});

export class FraudDetectionProtocol {
  constructor(config = {}) {
    this.version         = '1.0.0';
    this.domain          = 'business';
    this.safeThreshold   = config.safeThreshold   ?? 0.3;
    this.blockThreshold  = config.blockThreshold  ?? 0.8;
    this.historyWindow   = config.historyWindow   ?? 100;  // last N txs per customer

    this.#baseline       = new Map();   // customerId → { avg, stdDev, count }
    this.metrics         = { scored: 0, elevated: 0, high: 0, critical: 0, blocked: 0 };
  }

  #baseline;

  /**
   * Score a transaction for fraud risk.
   * @param {{ txId: string, customerId: string, amount: number, platform: string, countryCode?: string, deviceId?: string, timestamp?: string }} tx
   * @returns {{ txId: string, riskScore: number, riskLevel: string, signals: string[], shouldBlock: boolean }}
   */
  score(tx) {
    const signals  = [];
    let riskScore  = 0;

    // Signal 1: Amount anomaly vs customer baseline
    const base = this.#baseline.get(tx.customerId);
    if (base && base.count >= 3) {
      const zScore = (tx.amount - base.avg) / (base.stdDev || 1);
      if (zScore > PHI * 2) {
        signals.push(`Amount ${((zScore).toFixed(1))}σ above baseline`);
        riskScore += Math.min(0.4, zScore * 0.1);
      }
    } else if (!base) {
      signals.push('New customer — no baseline');
      riskScore += 0.1;
    }

    // Signal 2: High-risk country
    const HIGH_RISK_COUNTRIES = new Set(['XX', 'ZZ']); // configure per deployment
    if (tx.countryCode && HIGH_RISK_COUNTRIES.has(tx.countryCode)) {
      signals.push(`High-risk country: ${tx.countryCode}`);
      riskScore += 0.3;
    }

    // Signal 3: Rapid repeat transactions (velocity)
    const vel = this.#velocityCheck(tx);
    if (vel.suspicious) {
      signals.push(`Velocity: ${vel.count} transactions in ${vel.windowSec}s`);
      riskScore += 0.25;
    }

    // Signal 4: Round-number test (common in fraud)
    if (tx.amount % 100 === 0 && tx.amount > 500) {
      signals.push('Suspicious round amount');
      riskScore += 0.1;
    }

    // Phi-dampen: genuine patterns shouldn't be over-penalised
    riskScore = Math.min(1, riskScore * PHI_INV * PHI);

    const riskLevel   = this.#classify(riskScore);
    const shouldBlock = riskScore >= this.blockThreshold;

    this.#updateBaseline(tx);
    this.metrics.scored++;
    if (riskLevel === RISK_LEVELS.ELEVATED) this.metrics.elevated++;
    if (riskLevel === RISK_LEVELS.HIGH)     this.metrics.high++;
    if (riskLevel === RISK_LEVELS.CRITICAL) this.metrics.critical++;
    if (shouldBlock)                        this.metrics.blocked++;

    return { txId: tx.txId, riskScore: Math.round(riskScore * 1000) / 1000, riskLevel, signals, shouldBlock };
  }

  /**
   * Score a batch of transactions.
   * @param {object[]} transactions
   */
  scoreBatch(transactions = []) {
    return transactions.map((tx) => this.score(tx));
  }

  #classify(score) {
    if (score >= this.blockThreshold) return RISK_LEVELS.CRITICAL;
    if (score >= 0.6)                 return RISK_LEVELS.HIGH;
    if (score >= this.safeThreshold)  return RISK_LEVELS.ELEVATED;
    return RISK_LEVELS.SAFE;
  }

  #velocityCheck(tx) {
    const window = this.#recentTxs?.get(tx.customerId) ?? [];
    const now    = Date.now();
    const recent = window.filter((t) => now - t < 60_000);
    if (!this.#recentTxs) this.#recentTxs = new Map();
    this.#recentTxs.set(tx.customerId, [...recent, now].slice(-20));
    return { suspicious: recent.length > 5, count: recent.length, windowSec: 60 };
  }

  #recentTxs;

  #updateBaseline(tx) {
    const b = this.#baseline.get(tx.customerId) ?? { avg: 0, stdDev: 0, count: 0, _sum: 0, _sumSq: 0 };
    b._sum   += tx.amount;
    b._sumSq += tx.amount ** 2;
    b.count++;
    b.avg    = b._sum / b.count;
    b.stdDev = Math.sqrt(Math.max(0, b._sumSq / b.count - b.avg ** 2));
    this.#baseline.set(tx.customerId, b);
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default FraudDetectionProtocol;
