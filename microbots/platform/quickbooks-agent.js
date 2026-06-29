'use strict';
/**
 * QUICKBOOKS PLATFORM AGENT
 * Parent: x-platform-bot
 * Fetches QuickBooks invoices, expenses, and financial reports.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class QuickBooksAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('quickbooks-agent', parentBot, config);
    this.connector = config.connector ?? null;
    this.pollOps   = config.pollOps ?? ['listInvoices', 'listExpenses', 'getProfitLoss'];
  }

  async _execute(input = {}) {
    const results = { platform: 'quickbooks', operations: {}, errors: [] };

    if (!this.connector) {
      results.errors.push('No QuickBooksConnector provided');
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

module.exports = QuickBooksAgent;
