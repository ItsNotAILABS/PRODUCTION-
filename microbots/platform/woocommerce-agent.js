'use strict';
/**
 * WOOCOMMERCE PLATFORM AGENT
 * Parent: x-platform-bot
 * Syncs WooCommerce products, orders, and inventory.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class WooCommerceAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('woocommerce-agent', parentBot, config);
    this.connector = config.connector ?? null;
    this.pollOps   = config.pollOps ?? ['listProducts', 'listOrders', 'getStockStatus'];
  }

  async _execute(input = {}) {
    const results = { platform: 'woocommerce', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No WooCommerceConnector provided');
      return results;
    }

    for (const op of this.pollOps) {
      this.tick();
      try {
        results.operations[op] = await this.connector.execute(op, input.params?.[op] ?? {});
      } catch (err) {
        results.errors.push({ op, message: err.message });
      }
    }

    results.summary = { polled: this.pollOps.length, errors: results.errors.length, ts: new Date().toISOString() };
    return results;
  }
}

module.exports = WooCommerceAgent;
