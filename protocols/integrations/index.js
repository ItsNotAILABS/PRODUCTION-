/**
 * Integration Sub-Protocols — X Ecosystem
 * Derived from the core protocols; focused on cross-platform integrations and interoperability.
 * Domain: integrations | PROTO-I001 through PROTO-I020
 */

export { MCPGatewayProtocol }                                  from './mcp-gateway-protocol.js';
export { IntegrationOrchestrationProtocol, WORKFLOW_STATUS }   from './integration-orchestration-protocol.js';
export { DataNormalizationProtocol }                           from './data-normalization-protocol.js';
export { RateLimitManagerProtocol }                            from './rate-limit-manager-protocol.js';
export { WebhookOrchestrationProtocol }                        from './webhook-orchestration-protocol.js';
export { OAuthManagerProtocol }                                from './oauth-manager-protocol.js';
export { APIKeyManagerProtocol }                               from './api-key-manager-protocol.js';
export { DataSchemaProtocol }                                  from './data-schema-protocol.js';
export { EventStreamingProtocol }                              from './event-streaming-protocol.js';
export { BatchProcessingProtocol }                             from './batch-processing-protocol.js';
export { RetryRecoveryProtocol, CIRCUIT_STATE }                from './retry-recovery-protocol.js';
export { DataEnrichmentProtocol }                              from './data-enrichment-protocol.js';
export { MultiCurrencyProtocol }                               from './multi-currency-protocol.js';
export { TaxCalculationProtocol, TAX_TYPE }                    from './tax-calculation-protocol.js';
export { ShippingIntelligenceProtocol }                        from './shipping-intelligence-protocol.js';
export { LoyaltyRewardsProtocol }                              from './loyalty-rewards-protocol.js';
export { ProductCatalogProtocol }                              from './product-catalog-protocol.js';
export { OrderRoutingProtocol }                                from './order-routing-protocol.js';
export { CustomerIdentityProtocol }                            from './customer-identity-protocol.js';
export { AnalyticsAggregationProtocol }                        from './analytics-aggregation-protocol.js';
export { MultiFederationProtocol, FEDERATION_MSG, MEMBER_HEALTH } from './multi-ai-federation-protocol.js';
export { SemanticCacheProtocol }                               from './semantic-cache-protocol.js';
export { ModelRouterProtocol }                                 from './model-router-protocol.js';
export { SkillCompositionProtocol, SKILL_STRATEGY }            from './skill-composition-protocol.js';
export { ContextWindowProtocol }                               from './context-window-protocol.js';
export { VectorEmbeddingProtocol }                             from './vector-embedding-protocol.js';
export { PromptEngineeringProtocol }                           from './prompt-engineering-protocol.js';
export { KnowledgeGraphProtocol }                              from './knowledge-graph-protocol.js';
export { SentimentProtocol }                                   from './sentiment-protocol.js';
export { MultiModalProtocol }                                  from './multi-modal-protocol.js';
export { ConsensusVotingProtocol }                             from './consensus-voting-protocol.js';
export { BackgroundWorkflowProtocol, WORKFLOW_RECURRENCE }     from './background-workflow-protocol.js';

export const INTEGRATIONS_PROTOCOL_VERSION = '1.3.0';
export const INTEGRATIONS_PROTOCOL_COUNT   = 32;
