/**
 * PROTO-B003: Customer Segmentation Protocol (CSP)
 * Derives from: PatternSynthesisProtocol, MemoryPalaceProtocol
 * Segments customers by RFM (Recency, Frequency, Monetary) with phi-weighted scoring.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const SEGMENTS = Object.freeze({
  CHAMPIONS:       'champions',        // High RFM — best customers
  LOYAL:           'loyal',            // High frequency, moderate recency
  AT_RISK:         'at-risk',          // Was good, declining recency
  PROMISING:       'promising',        // Recent but low frequency
  LOST:            'lost',             // Low recency + low frequency
  HIGH_VALUE_IDLE: 'high-value-idle',  // High monetary, low recency
});

export class CustomerSegmentationProtocol {
  constructor(config = {}) {
    this.version     = '1.0.0';
    this.domain      = 'business';
    this.recencyDays = config.recencyDays ?? 90;
    this.metrics     = { segmented: 0, champions: 0, atRisk: 0, lost: 0 };
  }

  /**
   * Segment a customer list using phi-weighted RFM analysis.
   * @param {{ customerId: string, lastPurchaseDate: string, purchaseCount: number, totalSpend: number }[]} customers
   * @returns {{ segments: Record<string, object[]>, scores: object[], summary: object }}
   */
  segment(customers = []) {
    const now    = Date.now();
    const scored = customers.map((c) => this.#score(c, now));
    const segs   = this.#assign(scored);

    this.metrics.segmented += customers.length;
    this.metrics.champions  = (segs[SEGMENTS.CHAMPIONS] ?? []).length;
    this.metrics.atRisk     = (segs[SEGMENTS.AT_RISK]   ?? []).length;
    this.metrics.lost       = (segs[SEGMENTS.LOST]      ?? []).length;

    return {
      segments: segs,
      scores:   scored,
      summary: {
        total:      customers.length,
        champions:  this.metrics.champions,
        atRisk:     this.metrics.atRisk,
        lost:       this.metrics.lost,
        generatedAt:new Date().toISOString(),
      },
    };
  }

  /**
   * Generate retention actions for a segment.
   * @param {string} segment
   * @returns {string[]}
   */
  retentionActions(segment) {
    const ACTIONS = {
      [SEGMENTS.AT_RISK]:         ['Send win-back offer', 'Personalised discount', 'Re-engagement email'],
      [SEGMENTS.LOST]:            ['High-value discount campaign', 'Survey for feedback'],
      [SEGMENTS.HIGH_VALUE_IDLE]: ['VIP outreach', 'Exclusive preview', 'Account manager contact'],
      [SEGMENTS.PROMISING]:       ['Onboarding flow', 'First repeat-purchase incentive'],
      [SEGMENTS.LOYAL]:           ['Loyalty programme invite', 'Referral programme'],
      [SEGMENTS.CHAMPIONS]:       ['Early access', 'Co-creation invite', 'Ambassador programme'],
    };
    return ACTIONS[segment] ?? ['Standard engagement flow'];
  }

  #score(customer, now) {
    const daysSinceLastPurchase = (now - new Date(customer.lastPurchaseDate).getTime()) / 86_400_000;
    const recency    = Math.max(0, 1 - daysSinceLastPurchase / this.recencyDays);
    const frequency  = Math.min(1, customer.purchaseCount / 20);  // normalise to 20 purchases
    const monetary   = Math.min(1, Math.log1p(customer.totalSpend) / Math.log1p(10_000));

    // Phi-weighted composite: monetary matters most in the X model
    const rfmScore = recency * PHI_INV + frequency * PHI_INV + monetary * PHI;
    return {
      customerId: customer.customerId,
      recency, frequency, monetary,
      rfmScore: Math.round(rfmScore * 1000) / 1000,
      daysSinceLastPurchase: Math.round(daysSinceLastPurchase),
    };
  }

  #assign(scored) {
    const segs = Object.fromEntries(Object.values(SEGMENTS).map((s) => [s, []]));
    for (const s of scored) {
      const seg = this.#classify(s);
      segs[seg].push(s);
    }
    return segs;
  }

  #classify({ recency, frequency, monetary }) {
    if (recency > 0.7 && frequency > 0.6 && monetary > 0.6) return SEGMENTS.CHAMPIONS;
    if (frequency > 0.6 && monetary > 0.5)                   return SEGMENTS.LOYAL;
    if (recency < 0.3 && (frequency > 0.4 || monetary > 0.4))return SEGMENTS.AT_RISK;
    if (monetary > 0.5 && recency < 0.4)                     return SEGMENTS.HIGH_VALUE_IDLE;
    if (recency > 0.5 && frequency < 0.3)                    return SEGMENTS.PROMISING;
    return SEGMENTS.LOST;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default CustomerSegmentationProtocol;
