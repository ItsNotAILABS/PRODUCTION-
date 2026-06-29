'use strict';
/**
 * PRICING OPTIMIZER AGENT
 * Parent: x-business-bot
 * Runs PricingOptimizationProtocol over a product catalog and emits price recommendations.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class PricingOptimizerAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('pricing-optimizer-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // PricingOptimizationProtocol
  }

  async _execute(input = {}) {
    const { products = [], marketSignals = {} } = input;
    const results = { agent: this.name, recommendations: [], increases: [], decreases: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No PricingOptimizationProtocol provided'];
      return results;
    }

    for (const product of products) {
      this.tick();
      const rec = this.protocol.optimize(product, marketSignals);
      results.recommendations.push(rec);
      if (rec.recommendedPrice > product.currentPrice) results.increases.push(rec);
      if (rec.recommendedPrice < product.currentPrice) results.decreases.push(rec);
    }

    results.summary = {
      total: products.length,
      increases: results.increases.length,
      decreases: results.decreases.length,
      unchanged: products.length - results.increases.length - results.decreases.length,
    };

    return results;
  }
}

module.exports = PricingOptimizerAgent;
