'use strict';
/**
 * CUSTOMER ANALYZER AGENT
 * Parent: x-business-bot
 * Segments customers and scores churn risk using business protocols.
 */

const { MicrobotBase } = require('../../sdk/microbots/microbot-base.js');

class CustomerAnalyzerAgent extends MicrobotBase {
  constructor(parentBot, config = {}) {
    super('customer-analyzer-agent', parentBot, config);
    this.segmentation = config.segmentation ?? null;  // CustomerSegmentationProtocol
    this.retention    = config.retention    ?? null;  // CustomerRetentionProtocol
  }

  async _execute(input = {}) {
    const { customers = [] } = input;
    const results = { agent: this.name, segments: [], churnRisks: [], highRisk: [], ts: new Date().toISOString() };

    for (const customer of customers) {
      this.tick();

      if (this.segmentation) {
        const seg = this.segmentation.segment(customer);
        results.segments.push({ customerId: customer.customerId, ...seg });
      }

      if (this.retention) {
        const churn = this.retention.predictChurn(customer);
        results.churnRisks.push(churn);
        if (churn.churnRisk === 'high' || churn.churnRisk === 'churned') {
          const ltv = this.retention.calculateLTV({ avgOrderValue: customer.avgOrderValue, purchaseFrequencyPerYear: customer.orderFrequency * 12 });
          const interventions = this.retention.recommendInterventions({ ...churn, ltv: ltv.ltv });
          results.highRisk.push({ ...churn, ltv, interventions });
        }
      }
    }

    return results;
  }
}

module.exports = CustomerAnalyzerAgent;
