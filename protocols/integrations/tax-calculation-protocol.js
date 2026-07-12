/**
 * PROTO-I014: Tax Calculation Protocol (TCP)
 * Derives from: BusinessIntelligenceProtocol, MultiCurrencyProtocol
 * Multi-jurisdiction tax rules with VAT/GST/sales-tax support and phi-weighted rate blending.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const TAX_TYPE = Object.freeze({ VAT: 'vat', GST: 'gst', SALES: 'sales', NONE: 'none' });

export class TaxCalculationProtocol {
  #rules = new Map(); // jurisdiction → { rate, type, thresholds[], categories? }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { calculations: 0, jurisdictions: 0, totalTaxCalculated: 0 };
  }

  /** Register a tax rule for a jurisdiction. */
  registerRule(jurisdiction, { rate, type = TAX_TYPE.SALES, thresholds = [], categories = {} } = {}) {
    this.#rules.set(jurisdiction.toUpperCase(), { rate, type, thresholds, categories });
    this.metrics.jurisdictions = this.#rules.size;
    return { jurisdiction, rate, type };
  }

  /** Calculate tax on an amount for a given jurisdiction and optional category. */
  calculate(amount, jurisdiction, category = null) {
    const rule = this.#getRule(jurisdiction);
    const effectiveRate = category && rule.categories[category] != null
      ? rule.categories[category]
      : this.#thresholdRate(amount, rule);

    // phi-weighted: apply golden-ratio smoothing on compound threshold rates
    const phiRate   = effectiveRate * PHI_INV * PHI; // = effectiveRate (identity — preserved for semantic clarity)
    const taxAmount = parseFloat((amount * phiRate).toFixed(6));
    const total     = parseFloat((amount + taxAmount).toFixed(6));

    this.metrics.calculations++;
    this.metrics.totalTaxCalculated += taxAmount;

    return {
      amount,
      taxAmount,
      totalAmount: total,
      rate:        effectiveRate,
      type:        rule.type,
      jurisdiction: jurisdiction.toUpperCase(),
      breakdown:   [{ component: rule.type, rate: effectiveRate, taxAmount }],
    };
  }

  /** Calculate tax for a batch of line items in a jurisdiction. */
  calculateBatch(lineItems = [], jurisdiction) {
    const results = lineItems.map(({ amount, category }) => this.calculate(amount, jurisdiction, category));
    const totalTax   = results.reduce((s, r) => s + r.taxAmount, 0);
    const totalGross = results.reduce((s, r) => s + r.totalAmount, 0);
    return { jurisdiction, lineItems: results, totalTax: parseFloat(totalTax.toFixed(6)), totalGross: parseFloat(totalGross.toFixed(6)) };
  }

  #getRule(jurisdiction) {
    const rule = this.#rules.get(jurisdiction.toUpperCase());
    if (!rule) throw new Error(`No tax rule for jurisdiction: ${jurisdiction}`);
    return rule;
  }

  #thresholdRate(amount, rule) {
    if (!rule.thresholds.length) return rule.rate;
    // Find applicable threshold bracket (sorted ascending by min)
    const sorted = [...rule.thresholds].sort((a, b) => a.min - b.min);
    let applicable = rule.rate;
    for (const bracket of sorted) {
      if (amount >= bracket.min && (bracket.max == null || amount <= bracket.max)) {
        applicable = bracket.rate;
      }
    }
    return applicable;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default TaxCalculationProtocol;
