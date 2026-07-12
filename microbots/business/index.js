'use strict';
/**
 * Business Micro-Agents — X Ecosystem
 * Each agent wraps a business sub-protocol for autonomous operation.
 */

const SalesMonitorAgent      = require('./sales-monitor-agent.js');
const InventoryWatcherAgent  = require('./inventory-watcher-agent.js');
const CustomerAnalyzerAgent  = require('./customer-analyzer-agent.js');
const FraudSentinelAgent     = require('./fraud-sentinel-agent.js');
const RevenueReporterAgent   = require('./revenue-reporter-agent.js');
const PricingOptimizerAgent  = require('./pricing-optimizer-agent.js');

module.exports = { SalesMonitorAgent, InventoryWatcherAgent, CustomerAnalyzerAgent, FraudSentinelAgent, RevenueReporterAgent, PricingOptimizerAgent };
