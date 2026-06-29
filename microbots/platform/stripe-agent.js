'use strict';
/**
 * STRIPE PLATFORM AGENT
 * Parent: x-platform-bot
 * Monitors Stripe payments, subscriptions, and balance.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class StripeAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('stripe-agent', parentBot, config);
    this.connector = config.connector ?? null;
    this.pollOps   = config.pollOps ?? ['listPayments', 'listSubscriptions', 'getBalance'];
  }

  async _execute(input = {}) {
    const results = { platform: 'stripe', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No StripeConnector provided');
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

module.exports = StripeAgent;
