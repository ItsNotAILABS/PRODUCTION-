'use strict';
/**
 * INVENTORY WATCHER AGENT
 * Parent: x-business-bot
 * Runs InventoryOptimizationProtocol and flags reorder needs.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class InventoryWatcherAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('inventory-watcher-agent', parentBot, config);
    this.protocol = config.protocol ?? null;
  }

  async _execute(input = {}) {
    const { items = [] } = input;
    const results = { agent: this.name, recommendations: [], summary: null, urgent: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No InventoryOptimizationProtocol provided'];
      return results;
    }

    this.tick();
    const { recommendations, summary } = this.protocol.optimize(items);
    results.recommendations = recommendations;
    results.summary         = summary;
    results.urgent          = recommendations.filter((r) => r.action === 'reorder' && r.daysUntilStockout <= 7);

    return results;
  }
}

module.exports = InventoryWatcherAgent;
