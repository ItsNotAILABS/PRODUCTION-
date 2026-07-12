/**
 * PROTO-B008: Pricing Optimization Protocol (POP)
 * Derives from: AdaptiveOptimizerProtocol, RewardSignalProtocol
 * Dynamic pricing engine with phi-ratio elasticity modelling and margin protection.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class PricingOptimizationProtocol {
  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'business';
    this.minMargin     = config.minMargin     ?? 0.15;   // 15% minimum margin
    this.maxPriceSwing = config.maxPriceSwing ?? 0.25;   // ±25% max adjustment
    this.elasticity    = config.elasticity    ?? -1.5;   // default price elasticity
    this.metrics       = { optimized: 0, increases: 0, decreases: 0, marginsProtected: 0 };
  }

  /**
   * Compute the optimal price for a product.
   * @param {{ sku: string, currentPrice: number, cost: number, demandSignal: number, competitorPrice?: number, stockLevel?: number }} product
   * @returns {{ sku: string, recommendedPrice: number, change: number, changePct: number, reasoning: string[] }}
   */
  optimize(product) {
    const { sku, currentPrice, cost, demandSignal, competitorPrice, stockLevel } = product;
    const reasoning = [];
    let targetPrice = currentPrice;

    // Demand-based adjustment (phi-weighted)
    if (demandSignal > PHI) {
      const increase = Math.min(this.maxPriceSwing, (demandSignal - PHI) * 0.1 * PHI_INV);
      targetPrice   *= (1 + increase);
      reasoning.push(`Demand ${demandSignal.toFixed(2)}x above phi threshold — increase ${(increase * 100).toFixed(1)}%`);
    } else if (demandSignal < PHI_INV) {
      const decrease = Math.min(this.maxPriceSwing, (PHI_INV - demandSignal) * 0.1 * PHI);
      targetPrice   *= (1 - decrease);
      reasoning.push(`Demand ${demandSignal.toFixed(2)}x below phi threshold — decrease ${(decrease * 100).toFixed(1)}%`);
    }

    // Competitor anchoring
    if (competitorPrice) {
      const spread = (targetPrice - competitorPrice) / competitorPrice;
      if (Math.abs(spread) > 0.15) {
        const anchor  = (targetPrice + competitorPrice * PHI) / (1 + PHI);
        reasoning.push(`Anchoring to competitor: ${currentPrice.toFixed(2)} → ${anchor.toFixed(2)}`);
        targetPrice   = anchor;
      }
    }

    // Stock-level pressure (excess stock → discount)
    if (stockLevel !== undefined && stockLevel > 200) {
      const markdown = Math.min(0.1, (stockLevel - 200) / 2000);
      targetPrice   *= (1 - markdown);
      reasoning.push(`High stock (${stockLevel} units) — markdown ${(markdown * 100).toFixed(1)}%`);
    }

    // Margin floor protection
    const minPrice = cost * (1 + this.minMargin);
    if (targetPrice < minPrice) {
      targetPrice = minPrice;
      reasoning.push(`Margin floor applied — minimum ${(this.minMargin * 100).toFixed(0)}% above cost`);
      this.metrics.marginsProtected++;
    }

    // Snap to 2 decimal places
    targetPrice = Math.round(targetPrice * 100) / 100;
    const change    = targetPrice - currentPrice;
    const changePct = currentPrice !== 0 ? change / currentPrice : 0;

    this.metrics.optimized++;
    if (change > 0) this.metrics.increases++;
    if (change < 0) this.metrics.decreases++;

    return { sku, recommendedPrice: targetPrice, change: Math.round(change * 100) / 100, changePct: Math.round(changePct * 10000) / 10000, reasoning };
  }

  /**
   * Batch optimize a product catalogue.
   * @param {object[]} products
   * @returns {object[]}
   */
  optimizeCatalogue(products = []) {
    return products.map((p) => this.optimize(p));
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default PricingOptimizationProtocol;
