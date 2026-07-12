'use strict';
/**
 * SQUARE PLATFORM AGENT
 * Parent: x-platform-bot
 * Polls Square for new orders, payments, and inventory signals.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class SquareAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('square-agent', parentBot, config);
    this.connector = config.connector ?? null;  // SquareConnector instance
    this.pollOps   = config.pollOps ?? ['listOrders', 'listPayments', 'getInventory'];
  }

  async _execute(input = {}) {
    const results = { platform: 'square', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No SquareConnector provided — pass config.connector');
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

module.exports = SquareAgent;
