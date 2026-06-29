'use strict';
/**
 * REVENUE REPORTER AGENT
 * Parent: x-business-bot
 * Produces multi-horizon revenue forecasts using RevenueForecastProtocol.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class RevenueReporterAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('revenue-reporter-agent', parentBot, config);
    this.protocol  = config.protocol  ?? null;  // RevenueForecastProtocol
    this.horizons  = config.horizons  ?? [7, 30, 90];
  }

  async _execute(input = {}) {
    const { historicalData = [] } = input;
    const results = { agent: this.name, forecasts: {}, summary: null, ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No RevenueForecastProtocol provided'];
      return results;
    }

    this.tick();
    for (const days of this.horizons) {
      results.forecasts[`${days}d`] = this.protocol.forecast(historicalData, days);
    }

    results.summary = this.protocol.digest(historicalData);
    return results;
  }
}

module.exports = RevenueReporterAgent;
