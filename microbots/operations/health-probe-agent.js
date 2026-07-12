'use strict';
/**
 * HEALTH PROBE AGENT
 * Parent: x-operations-bot
 * Runs a HealthMonitoringProtocol pulse and surfaces degradation or recovery events.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class HealthProbeAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('health-probe-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // HealthMonitoringProtocol instance
  }

  async _execute(input = {}) {
    const results = { agent: this.name, pulse: null, trend: null, alerts: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.alerts.push({ level: 'warning', message: 'No HealthMonitoringProtocol provided' });
      return results;
    }

    this.tick();
    results.pulse = await this.protocol.pulse();
    results.trend = this.protocol.trend(input.trendWindow ?? 10);

    if (results.pulse.status === 'critical' || results.pulse.status === 'dead') {
      results.alerts.push({ level: 'critical', message: `System ${results.pulse.status}: score ${results.pulse.score}` });
    } else if (results.trend.trend === 'declining') {
      results.alerts.push({ level: 'warning', message: `Health declining — avg score ${results.trend.avgScore}` });
    }

    return results;
  }
}

module.exports = HealthProbeAgent;
