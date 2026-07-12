/**
 * PROTO-B010: Customer Retention Protocol (CRP)
 * Derives from: PredictiveCodingProtocol, RewardSignalProtocol, MemoryLineageProtocol
 * Churn prediction, lifetime value calculation, and retention intervention scoring.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class CustomerRetentionProtocol {
  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'business';
    this.churnWindow   = config.churnWindow   ?? 60;    // days of inactivity = churned
    this.ltvHorizon    = config.ltvHorizon    ?? 365;   // days for LTV calculation
    this.metrics       = { scored: 0, churnPredicted: 0, interventions: 0, ltvCalculated: 0 };
  }

  /**
   * Predict churn probability for a customer.
   * @param {{ customerId: string, daysSinceLastOrder: number, orderFrequency: number, avgOrderValue: number, supportTickets?: number, returnRate?: number }} customer
   * @returns {{ customerId: string, churnProbability: number, churnRisk: 'low'|'medium'|'high'|'churned', interventionScore: number }}
   */
  predictChurn(customer) {
    const { customerId, daysSinceLastOrder, orderFrequency, avgOrderValue, supportTickets = 0, returnRate = 0 } = customer;

    // Inactivity signal (primary)
    const inactivity = Math.min(1, daysSinceLastOrder / this.churnWindow);

    // Frequency decay
    const freqDecay  = Math.max(0, 1 - orderFrequency * PHI_INV);

    // Friction signals
    const friction   = Math.min(1, (supportTickets * 0.1 + returnRate * 0.3));

    // Phi-weighted churn probability
    const churnProbability = (inactivity * PHI + freqDecay * 1 + friction * PHI_INV) / (PHI + 1 + PHI_INV);
    const capped = Math.min(1, churnProbability);

    const churnRisk = capped >= 0.8 ? 'churned'
      : capped >= 0.55 ? 'high'
      : capped >= 0.3  ? 'medium' : 'low';

    const interventionScore = this.#interventionScore(capped, avgOrderValue);

    this.metrics.scored++;
    if (churnRisk === 'high' || churnRisk === 'churned') this.metrics.churnPredicted++;

    return { customerId, churnProbability: Math.round(capped * 1000) / 1000, churnRisk, interventionScore };
  }

  /**
   * Calculate Customer Lifetime Value.
   * @param {{ avgOrderValue: number, purchaseFrequencyPerYear: number, avgCustomerLifetimeYears?: number }} params
   * @returns {{ ltv: number, annualValue: number }}
   */
  calculateLTV({ avgOrderValue, purchaseFrequencyPerYear, avgCustomerLifetimeYears = 3 }) {
    const annualValue = avgOrderValue * purchaseFrequencyPerYear;
    const ltv         = annualValue * avgCustomerLifetimeYears * PHI_INV;  // phi-discounted
    this.metrics.ltvCalculated++;
    return { ltv: Math.round(ltv * 100) / 100, annualValue: Math.round(annualValue * 100) / 100 };
  }

  /**
   * Recommend retention interventions for a customer segment.
   * @param {{ churnRisk: string, ltv: number, churnProbability: number }} profile
   * @returns {string[]}
   */
  recommendInterventions(profile) {
    const { churnRisk, ltv, churnProbability } = profile;
    const high = ltv > 1000;
    const actions = [];

    if (churnRisk === 'churned')  {
      actions.push('Win-back campaign — high-value discount');
      if (high) actions.push('Personal outreach from account manager');
    } else if (churnRisk === 'high') {
      actions.push('Re-engagement email sequence');
      if (high) actions.push('Loyalty points bonus or exclusive offer');
    } else if (churnRisk === 'medium') {
      actions.push('Check-in email with product recommendations');
    } else {
      actions.push('Continue standard engagement flow');
    }

    this.metrics.interventions += actions.length;
    return actions;
  }

  /**
   * Score the ROI of an intervention relative to customer LTV.
   */
  #interventionScore(churnProb, avgOrderValue) {
    const savedValue = churnProb * avgOrderValue * this.ltvHorizon / 365;
    return Math.min(1, savedValue / (avgOrderValue * PHI || 1));
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default CustomerRetentionProtocol;
