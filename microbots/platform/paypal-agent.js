'use strict';
/**
 * PAYPAL PLATFORM AGENT
 * Parent: x-platform-bot
 * Monitors PayPal orders, transactions, and payouts.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class PayPalAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('paypal-agent', parentBot, config);
    this.connector = config.connector ?? null;
    this.pollOps   = config.pollOps ?? ['listOrders', 'listTransactions', 'listPayouts'];
  }

  async _execute(input = {}) {
    const results = { platform: 'paypal', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No PayPalConnector provided');
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

module.exports = PayPalAgent;
