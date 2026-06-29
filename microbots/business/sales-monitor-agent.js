'use strict';
/**
 * SALES MONITOR AGENT
 * Parent: x-business-bot
 * Runs SalesIntelligenceProtocol over a transaction batch and surfaces insights.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class SalesMonitorAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('sales-monitor-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // SalesIntelligenceProtocol instance
  }

  async _execute(input = {}) {
    const { transactions = [], platforms = [] } = input;
    const results = { agent: this.name, insights: null, velocities: [], warnings: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings.push('No SalesIntelligenceProtocol provided — pass config.protocol');
      return results;
    }

    this.tick();
    if (transactions.length > 0) {
      results.insights = this.protocol.analyze(transactions);
    }

    for (const { platform, revenue } of platforms) {
      this.tick();
      results.velocities.push({ platform, ...this.protocol.scoreVelocity(platform, revenue) });
    }

    return results;
  }
}

module.exports = SalesMonitorAgent;
