/**
 * Operations Sub-Protocols — X Ecosystem
 * Derived from the core 75 protocols; focused on operational excellence.
 * Domain: operations | PROTO-O001 through PROTO-O008
 */

export { HealthMonitoringProtocol, HEALTH_STATUS }                             from './health-monitoring-protocol.js';
export { AlertRoutingProtocol, SEVERITY }                                      from './alert-routing-protocol.js';
export { PerformanceOptimizationProtocol, PERF_STATUS }                        from './performance-optimization-protocol.js';
export { DeploymentOrchestrationProtocol, DEPLOY_STATUS, DEPLOY_STRATEGY }    from './deployment-orchestration-protocol.js';
export { SecurityGatewayProtocol, THREAT_LEVEL, ACCESS_RESULT }               from './security-gateway-protocol.js';
export { ComplianceAuditProtocol, AUDIT_SEVERITY, COMPLIANCE_STATUS }         from './compliance-audit-protocol.js';
export { ResourceAllocationProtocol, ALLOCATION_STATUS }                       from './resource-allocation-protocol.js';
export { KnowledgeSynthesisProtocol, KNOWLEDGE_TYPE }                         from './knowledge-synthesis-protocol.js';

export const OPERATIONS_PROTOCOL_VERSION = '1.0.0';
export const OPERATIONS_PROTOCOL_COUNT   = 8;
