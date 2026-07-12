'use strict';
/**
 * FRAUD SENTINEL AGENT
 * Parent: x-business-bot
 * Evaluates transactions through FraudDetectionProtocol and flags high-risk events.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class FraudSentinelAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('fraud-sentinel-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // FraudDetectionProtocol instance
  }

  async _execute(input = {}) {
    const { transactions = [] } = input;
    const results = { agent: this.name, scores: [], flagged: [], blocked: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No FraudDetectionProtocol provided'];
      return results;
    }

    for (const txn of transactions) {
      this.tick();
      const score = this.protocol.score(txn);
      results.scores.push(score);
      if (score.riskLevel === 'high')     results.flagged.push(score);
      if (score.riskLevel === 'critical') results.blocked.push(score);
    }

    results.summary = {
      total: transactions.length,
      flagged: results.flagged.length,
      blocked: results.blocked.length,
    };

    return results;
  }
}

module.exports = FraudSentinelAgent;
