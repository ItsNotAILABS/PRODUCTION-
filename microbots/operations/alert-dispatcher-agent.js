'use strict';
/**
 * ALERT DISPATCHER AGENT
 * Parent: x-operations-bot
 * Routes a batch of alerts through AlertRoutingProtocol and reports dispatch results.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class AlertDispatcherAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('alert-dispatcher-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // AlertRoutingProtocol instance
  }

  async _execute(input = {}) {
    const { alerts = [] } = input;
    const results = { agent: this.name, dispatched: [], deduplicated: [], suppressed: [], failed: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.failed.push({ message: 'No AlertRoutingProtocol provided' });
      return results;
    }

    for (const alert of alerts) {
      this.tick();
      const outcome = this.protocol.route(alert);
      if (outcome.routed)                    results.dispatched.push({ alert: alert.id ?? alert.title, handlers: outcome.handlers });
      else if (outcome.reason === 'deduplicated') results.deduplicated.push(alert.title);
      else                                    results.suppressed.push(alert.title);
    }

    results.metrics = this.protocol.report().metrics;
    return results;
  }
}

module.exports = AlertDispatcherAgent;
