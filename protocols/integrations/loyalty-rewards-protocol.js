/**
 * PROTO-I016: Loyalty Rewards Protocol (LRP)
 * Derives from: CustomerRetentionProtocol, CustomerSegmentationProtocol
 * Cross-platform loyalty program with phi-weighted tier thresholds and bonus multipliers.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class LoyaltyRewardsProtocol {
  #programs  = new Map(); // platformId → { pointsPerDollar, redemptionRate, tiers[] }
  #customers = new Map(); // customerId → { balance, platformPoints: Map, tier }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { earned: 0, redeemed: 0, customers: 0 };
  }

  /** Register a loyalty program for a platform. */
  registerProgram(platformId, { pointsPerDollar = 1, redemptionRate = 0.01, tiers = [] } = {}) {
    this.#programs.set(platformId, { pointsPerDollar, redemptionRate, tiers });
    return { platformId, pointsPerDollar, redemptionRate, tierCount: tiers.length };
  }

  /** Earn points from a purchase. Returns updated balance and tier. */
  earnPoints(customerId, platformId, amount) {
    const program = this.#getProgram(platformId);
    if (!this.#customers.has(customerId)) {
      this.#customers.set(customerId, { balance: 0, platformPoints: new Map(), tier: null });
      this.metrics.customers++;
    }
    const cust = this.#customers.get(customerId);

    const bonusMultiplier = this.#bonusMultiplier(cust.balance, program.tiers);
    const earned = Math.round(amount * program.pointsPerDollar * bonusMultiplier);
    cust.balance += earned;
    cust.platformPoints.set(platformId, (cust.platformPoints.get(platformId) ?? 0) + earned);
    cust.tier = this.#resolveTier(cust.balance, program.tiers);
    this.metrics.earned += earned;

    return { points: earned, newBalance: cust.balance, tier: cust.tier, bonusMultiplier };
  }

  /** Redeem points. Returns dollar value credited and remaining balance. */
  redeemPoints(customerId, points) {
    const cust = this.#customers.get(customerId);
    if (!cust) throw new Error(`Customer not found: ${customerId}`);
    if (cust.balance < points) throw new Error(`Insufficient points: have ${cust.balance}, need ${points}`);

    // Use highest available program's redemption rate (phi-weighted)
    const rate = this.#bestRedemptionRate();
    cust.balance -= points;
    const dollarValue = parseFloat((points * rate).toFixed(4));
    this.metrics.redeemed += points;

    return { redeemed: points, dollarValue, newBalance: cust.balance };
  }

  #getProgram(platformId) {
    const prog = this.#programs.get(platformId);
    if (!prog) throw new Error(`No loyalty program for platform: ${platformId}`);
    return prog;
  }

  #resolveTier(balance, tiers) {
    if (!tiers.length) return null;
    // phi-weighted thresholds: sort descending, pick first tier the customer qualifies for
    const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
    return sorted.find((t) => balance >= t.threshold)?.name ?? sorted[sorted.length - 1].name;
  }

  #bonusMultiplier(balance, tiers) {
    if (!tiers.length) return 1;
    const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
    const tier   = sorted.find((t) => balance >= t.threshold);
    const base   = tier?.multiplier ?? 1;
    // phi-weight: higher tiers get additional phi-scaling
    const rank   = tier ? sorted.indexOf(tier) : tiers.length;
    return parseFloat((base * (1 + rank * PHI_INV * 0.1)).toFixed(4));
  }

  #bestRedemptionRate() {
    let best = 0.01;
    for (const { redemptionRate } of this.#programs.values()) {
      if (redemptionRate * PHI > best * PHI) best = redemptionRate;
    }
    return best;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default LoyaltyRewardsProtocol;
