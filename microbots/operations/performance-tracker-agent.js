'use strict';
/**
 * PERFORMANCE TRACKER AGENT
 * Parent: x-operations-bot
 * Records performance samples through PerformanceOptimizationProtocol
 * and returns bottleneck analysis + tuning suggestions.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class PerformanceTrackerAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('performance-tracker-agent', parentBot, config);
    this.protocol = config.protocol ?? null;  // PerformanceOptimizationProtocol instance
  }

  async _execute(input = {}) {
    const { samples = [] } = input;
    const results = { agent: this.name, profile: null, bottlenecks: [], tuning: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No PerformanceOptimizationProtocol provided'];
      return results;
    }

    for (const sample of samples) {
      this.tick();
      this.protocol.record(sample);
    }

    results.profile      = this.protocol.profile();
    results.bottlenecks  = this.protocol.detectBottlenecks();
    results.tuning       = this.protocol.suggestTuning();

    return results;
  }
}

module.exports = PerformanceTrackerAgent;
