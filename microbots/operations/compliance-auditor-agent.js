'use strict';
/**
 * COMPLIANCE AUDITOR AGENT
 * Parent: x-operations-bot
 * Logs events and generates compliance reports through ComplianceAuditProtocol.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class ComplianceAuditorAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('compliance-auditor-agent', parentBot, config);
    this.protocol   = config.protocol ?? null;  // ComplianceAuditProtocol instance
    this.reportOpts = config.reportOpts ?? {};
  }

  async _execute(input = {}) {
    const { events = [], generateReport = true } = input;
    const results = { agent: this.name, logged: [], chainValid: null, report: null, violations: [], ts: new Date().toISOString() };

    if (!this.protocol) {
      results.warnings = ['No ComplianceAuditProtocol provided'];
      return results;
    }

    for (const event of events) {
      this.tick();
      const entry = this.protocol.log(event);
      results.logged.push(entry);
    }

    const chain = this.protocol.verifyChain();
    results.chainValid = chain.valid;
    if (!chain.valid) results.violations.push({ type: 'chain_integrity', firstBroken: chain.firstBroken });

    if (generateReport) {
      results.report = this.protocol.generateReport(this.reportOpts);
      results.violations.push(...results.report.rulesSummary.filter((r) => r.violations > 0).map((r) => ({ type: 'rule_violation', ...r })));
    }

    return results;
  }
}

module.exports = ComplianceAuditorAgent;
