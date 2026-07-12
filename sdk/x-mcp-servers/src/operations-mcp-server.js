/**
 * Operations MCP Server
 * Exposes all 8 operations sub-protocols as Model Context Protocol tools.
 */

import { MCPTransport }                      from './mcp-transport.js';
import { HealthMonitoringProtocol }          from '../../../protocols/operations/health-monitoring-protocol.js';
import { AlertRoutingProtocol }              from '../../../protocols/operations/alert-routing-protocol.js';
import { PerformanceOptimizationProtocol }   from '../../../protocols/operations/performance-optimization-protocol.js';
import { DeploymentOrchestrationProtocol }   from '../../../protocols/operations/deployment-orchestration-protocol.js';
import { SecurityGatewayProtocol }           from '../../../protocols/operations/security-gateway-protocol.js';
import { ComplianceAuditProtocol }           from '../../../protocols/operations/compliance-audit-protocol.js';
import { ResourceAllocationProtocol }        from '../../../protocols/operations/resource-allocation-protocol.js';
import { KnowledgeSynthesisProtocol }        from '../../../protocols/operations/knowledge-synthesis-protocol.js';

export class OperationsMCPServer {
  constructor(config = {}) {
    this.name    = 'x-operations';
    this.version = '1.0.0';
    this.health      = new HealthMonitoringProtocol(config.health);
    this.alerts      = new AlertRoutingProtocol(config.alerts);
    this.perf        = new PerformanceOptimizationProtocol(config.performance);
    this.deploy      = new DeploymentOrchestrationProtocol(config.deployment);
    this.security    = new SecurityGatewayProtocol(config.security);
    this.compliance  = new ComplianceAuditProtocol(config.compliance);
    this.resources   = new ResourceAllocationProtocol(config.resources);
    this.knowledge   = new KnowledgeSynthesisProtocol(config.knowledge);
    this.metrics     = { calls: 0, errors: 0 };
  }

  listTools() {
    return [
      {
        name: 'health_pulse',
        description: 'Run all registered health checks and return a scored pulse result.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'health_trend',
        description: 'Compute health trend over the last N pulses.',
        inputSchema: { type: 'object', properties: { n: { type: 'number', description: 'Number of recent pulses to analyze (default 10)' } } },
      },
      {
        name: 'alert_route',
        description: 'Route an alert through dedup, suppression, and severity escalation.',
        inputSchema: { type: 'object', properties: { source: { type: 'string' }, severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] }, title: { type: 'string' }, body: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['source', 'severity', 'title'] },
      },
      {
        name: 'perf_record',
        description: 'Record a performance sample (latency, CPU, memory, throughput).',
        inputSchema: { type: 'object', properties: { latencyMs: { type: 'number' }, cpuPct: { type: 'number' }, memPct: { type: 'number' }, throughput: { type: 'number' }, errorRate: { type: 'number' } }, required: ['latencyMs', 'cpuPct', 'memPct', 'throughput'] },
      },
      {
        name: 'perf_profile',
        description: 'Get the current performance profile (p50, p95, status, score) from recent samples.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'perf_bottlenecks',
        description: 'Detect performance bottlenecks and get recommendations.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'deploy_initiate',
        description: 'Initiate a deployment with a strategy (canary, blue_green, rolling, immediate).',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, service: { type: 'string' }, version: { type: 'string' }, strategy: { type: 'string', enum: ['canary', 'blue_green', 'rolling', 'immediate'] }, env: { type: 'string' } }, required: ['id', 'service', 'version'] },
      },
      {
        name: 'deploy_advance_canary',
        description: 'Advance canary traffic percentage for a deployment.',
        inputSchema: { type: 'object', properties: { deploymentId: { type: 'string' }, trafficPct: { type: 'number' } }, required: ['deploymentId', 'trafficPct'] },
      },
      {
        name: 'deploy_evaluate',
        description: 'Run release gates and promote or rollback a deployment.',
        inputSchema: { type: 'object', properties: { deploymentId: { type: 'string' } }, required: ['deploymentId'] },
      },
      {
        name: 'security_evaluate',
        description: 'Evaluate an incoming request for threat level and access decision.',
        inputSchema: { type: 'object', properties: { identity: { type: 'string' }, ip: { type: 'string' }, method: { type: 'string' }, path: { type: 'string' } }, required: ['identity'] },
      },
      {
        name: 'compliance_log',
        description: 'Log an auditable event to the immutable compliance trail.',
        inputSchema: { type: 'object', properties: { actor: { type: 'string' }, action: { type: 'string' }, resource: { type: 'string' }, outcome: { type: 'string', enum: ['success', 'failure'] }, meta: { type: 'object' } }, required: ['actor', 'action', 'resource', 'outcome'] },
      },
      {
        name: 'compliance_report',
        description: 'Generate a compliance report for a time window.',
        inputSchema: { type: 'object', properties: { fromTs: { type: 'string' }, toTs: { type: 'string' }, actor: { type: 'string' } } },
      },
      {
        name: 'compliance_verify_chain',
        description: 'Verify the hash chain integrity of the audit trail.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'resource_allocate',
        description: 'Request compute resource allocation using phi-weighted bin-packing.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, cpuCores: { type: 'number' }, memoryGb: { type: 'number' }, priority: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['id', 'cpuCores', 'memoryGb'] },
      },
      {
        name: 'resource_cluster_utilization',
        description: 'Get cluster-wide CPU and memory utilization snapshot.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'knowledge_ingest',
        description: 'Ingest a knowledge item into the synthesis base.',
        inputSchema: { type: 'object', properties: { type: { type: 'string' }, source: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' } }, required: ['source', 'content'] },
      },
      {
        name: 'knowledge_query',
        description: 'Query the knowledge base by tags, source, type, and confidence.',
        inputSchema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } }, source: { type: 'string' }, type: { type: 'string' }, minConfidence: { type: 'number' }, limit: { type: 'number' } } },
      },
    ];
  }

  async callTool(name, args) {
    this.metrics.calls++;
    try {
      const result = await this.#route(name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      this.metrics.errors++;
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }

  async #route(name, args) {
    switch (name) {
      case 'health_pulse':             return await this.health.pulse();
      case 'health_trend':             return this.health.trend(args.n);
      case 'alert_route':              return this.alerts.route(args);
      case 'perf_record':              this.perf.record(args); return { recorded: true };
      case 'perf_profile':             return this.perf.profile();
      case 'perf_bottlenecks':         return this.perf.detectBottlenecks();
      case 'deploy_initiate':          return this.deploy.initiate(args);
      case 'deploy_advance_canary':    return this.deploy.advanceCanary(args.deploymentId, args.trafficPct);
      case 'deploy_evaluate':          return await this.deploy.evaluate(args.deploymentId);
      case 'security_evaluate':        return this.security.evaluate(args);
      case 'compliance_log':           return this.compliance.log(args);
      case 'compliance_report':        return this.compliance.generateReport(args);
      case 'compliance_verify_chain':  return this.compliance.verifyChain();
      case 'resource_allocate':        return this.resources.allocate(args);
      case 'resource_cluster_utilization': return this.resources.clusterUtilization();
      case 'knowledge_ingest':         return this.knowledge.ingest(args);
      case 'knowledge_query':          return this.knowledge.query(args);
      default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
    }
  }

  report() {
    return { server: this.name, version: this.version, tools: this.listTools().length, metrics: this.metrics };
  }

  start({ stdio = false, http = false, port = 3101 } = {}) {
    const transport = new MCPTransport(this);
    if (stdio) transport.startStdio();
    if (http)  return transport.startHttp(port);
    return transport;
  }
}

if (process.argv[1] && process.argv[1].endsWith('operations-mcp-server.js')) {
  const server  = new OperationsMCPServer();
  const useHttp = process.argv.includes('--http');
  const port    = parseInt(process.argv[process.argv.indexOf('--http') + 1] || '3101', 10);
  server.start({ stdio: !useHttp, http: useHttp, port });
}

export default OperationsMCPServer;
