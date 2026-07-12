/**
 * Business Sub-Protocols — X Ecosystem
 * Derived from the core 75 protocols; focused on commerce and business operations.
 * Domain: business | PROTO-B001 through PROTO-B010
 */

export { SalesIntelligenceProtocol, SALES_INTEL_VERSION }         from './sales-intelligence-protocol.js';
export { InventoryOptimizationProtocol, INVENTORY_OPT_VERSION }   from './inventory-optimization-protocol.js';
export { CustomerSegmentationProtocol, SEGMENTS }                  from './customer-segmentation-protocol.js';
export { FraudDetectionProtocol, RISK_LEVELS }                     from './fraud-detection-protocol.js';
export { RevenueForecastProtocol }                                  from './revenue-forecast-protocol.js';
export { CrossPlatformSyncProtocol, SYNC_STATUS, CONFLICT_STRATEGY } from './cross-platform-sync-protocol.js';
export { BusinessIntelligenceProtocol }                            from './business-intelligence-protocol.js';
export { PricingOptimizationProtocol }                             from './pricing-optimization-protocol.js';
export { SupplyChainProtocol }                                     from './supply-chain-protocol.js';
export { CustomerRetentionProtocol }                               from './customer-retention-protocol.js';

export const BUSINESS_PROTOCOL_VERSION = '1.0.0';
export const BUSINESS_PROTOCOL_COUNT   = 10;
