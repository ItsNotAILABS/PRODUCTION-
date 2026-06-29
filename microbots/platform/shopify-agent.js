'use strict';
/**
 * SHOPIFY PLATFORM AGENT
 * Parent: x-platform-bot
 * Syncs Shopify products, orders, and customer events.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class ShopifyAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('shopify-agent', parentBot, config);
    this.connector = config.connector ?? null;
    this.pollOps   = config.pollOps ?? ['listProducts', 'listOrders', 'listCustomers'];
  }

  async _execute(input = {}) {
    const results = { platform: 'shopify', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No ShopifyConnector provided');
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

module.exports = ShopifyAgent;
