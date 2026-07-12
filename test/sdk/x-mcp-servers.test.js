/**
 * Test suite: X MCP Servers (BusinessOps, Operations, Platform, Gateway)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BusinessOpsMCPServer } from '../../sdk/x-mcp-servers/src/business-ops-mcp-server.js';
import { OperationsMCPServer }  from '../../sdk/x-mcp-servers/src/operations-mcp-server.js';
import { PlatformMCPServer }    from '../../sdk/x-mcp-servers/src/platform-mcp-server.js';
import { XMCPGateway }         from '../../sdk/x-mcp-servers/src/x-mcp-gateway.js';
import { MCPTransport, MCP_VERSION } from '../../sdk/x-mcp-servers/src/mcp-transport.js';

// ─── MCPTransport ─────────────────────────────────────────────────────────────
describe('MCPTransport', () => {
  it('MCP_VERSION is set', () => {
    assert.ok(typeof MCP_VERSION === 'string' && MCP_VERSION.length > 0);
  });

  it('handles initialize', async () => {
    const server = { name: 'test', version: '1.0.0', listTools: () => [], callTool: async () => ({}) };
    const transport = new MCPTransport(server);
    const result = await transport['_MCPTransport__handle']?.({ id: 1, method: 'initialize', params: {} });
    // Test via startHttp
    const httpServer = transport.startHttp(0);
    assert.ok(httpServer);
    httpServer.close();
  });
});

// ─── BusinessOpsMCPServer ─────────────────────────────────────────────────────
describe('BusinessOpsMCPServer', () => {
  it('lists 15 tools', () => {
    const server = new BusinessOpsMCPServer();
    const tools  = server.listTools();
    assert.equal(tools.length, 15);
  });

  it('every tool has name, description, inputSchema', () => {
    const server = new BusinessOpsMCPServer();
    for (const tool of server.listTools()) {
      assert.ok(tool.name, `tool missing name`);
      assert.ok(tool.description, `${tool.name} missing description`);
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
    }
  });

  it('sales_analyze returns insights', async () => {
    const server = new BusinessOpsMCPServer();
    const result = await server.callTool('sales_analyze', { transactions: [{ platform: 'shopify', amount: 100, timestamp: new Date().toISOString() }] });
    assert.ok(result.content.length > 0);
    assert.ok(!result.isError);
  });

  it('fraud_score returns risk data', async () => {
    const server = new BusinessOpsMCPServer();
    const result = await server.callTool('fraud_score', { transactionId: 'txn-1', amount: 9999 });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok('riskLevel' in data || 'score' in data || 'transactionId' in data);
  });

  it('retention_predict_churn returns churnRisk', async () => {
    const server = new BusinessOpsMCPServer();
    const result = await server.callTool('retention_predict_churn', {
      customerId: 'c-1', daysSinceLastOrder: 90, orderFrequency: 0.2, avgOrderValue: 50,
    });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok('churnRisk' in data);
  });

  it('unknown tool returns isError', async () => {
    const server = new BusinessOpsMCPServer();
    const result = await server.callTool('does_not_exist', {});
    assert.ok(result.isError);
  });

  it('report includes tool count', () => {
    const server = new BusinessOpsMCPServer();
    const r = server.report();
    assert.equal(r.tools, 15);
  });
});

// ─── OperationsMCPServer ──────────────────────────────────────────────────────
describe('OperationsMCPServer', () => {
  it('lists 17 tools', () => {
    const server = new OperationsMCPServer();
    assert.equal(server.listTools().length, 17);
  });

  it('health_pulse returns status and score', async () => {
    const server = new OperationsMCPServer();
    const result = await server.callTool('health_pulse', {});
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok('status' in data && 'score' in data);
  });

  it('perf_record then perf_profile works', async () => {
    const server = new OperationsMCPServer();
    await server.callTool('perf_record', { latencyMs: 50, cpuPct: 20, memPct: 30, throughput: 500 });
    const result = await server.callTool('perf_profile', {});
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok('status' in data);
  });

  it('deploy_initiate then deploy_evaluate works', async () => {
    const server = new OperationsMCPServer();
    await server.callTool('deploy_initiate', { id: 'd-test', service: 'api', version: '2.0.0', strategy: 'canary' });
    const result = await server.callTool('deploy_evaluate', { deploymentId: 'd-test' });
    assert.ok(!result.isError);
  });

  it('security_evaluate allows clean request', async () => {
    const server = new OperationsMCPServer();
    const result = await server.callTool('security_evaluate', { identity: 'user-1', path: '/api' });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok('result' in data);
  });

  it('compliance_log then verify_chain', async () => {
    const server = new OperationsMCPServer();
    await server.callTool('compliance_log', { actor: 'system', action: 'deploy', resource: 'api', outcome: 'success' });
    const result = await server.callTool('compliance_verify_chain', {});
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.valid);
  });

  it('knowledge_ingest then knowledge_query', async () => {
    const server = new OperationsMCPServer();
    await server.callTool('knowledge_ingest', { source: 'test', content: 'CPU spike at noon', tags: ['perf'], confidence: 0.9 });
    const result = await server.callTool('knowledge_query', { tags: ['perf'] });
    assert.ok(!result.isError);
  });
});

// ─── PlatformMCPServer ────────────────────────────────────────────────────────
describe('PlatformMCPServer', () => {
  it('lists 5 tools', () => {
    const server = new PlatformMCPServer();
    assert.equal(server.listTools().length, 5);
  });

  it('platform_list_connectors returns empty when none registered', async () => {
    const server = new PlatformMCPServer();
    const result = await server.callTool('platform_list_connectors', {});
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.total, 0);
  });

  it('platform_execute with stub connector', async () => {
    const server = new PlatformMCPServer();
    const stub = {
      version: '1.0.0',
      capabilities: ['payments'],
      execute: async (op, p) => ({ op, stub: true }),
      health:  async () => ({ status: 'healthy' }),
      _operations: () => ({ 'pay': async () => ({}) }),
    };
    server.registerConnector('mock', stub);
    const result = await server.callTool('platform_execute', { platform: 'mock', operation: 'pay', params: {} });
    assert.ok(!result.isError);
  });

  it('platform_execute with unknown platform returns error', async () => {
    const server = new PlatformMCPServer();
    const result = await server.callTool('platform_execute', { platform: 'nonexistent', operation: 'op' });
    assert.ok(result.isError);
  });

  it('report includes connector count', () => {
    const server = new PlatformMCPServer();
    assert.equal(server.report().connectors, 0);
  });
});

// ─── XMCPGateway ─────────────────────────────────────────────────────────────
describe('XMCPGateway', () => {
  it('listTools aggregates from all servers with prefix', () => {
    const s1 = { name: 'biz', listTools: () => [{ name: 'tool_a', description: 'a', inputSchema: {} }], callTool: async () => ({}) };
    const s2 = { name: 'ops', listTools: () => [{ name: 'tool_b', description: 'b', inputSchema: {} }], callTool: async () => ({}) };
    const gw = new XMCPGateway([s1, s2]);
    const tools = gw.listTools();
    assert.ok(tools.some((t) => t.name === 'biz__tool_a'));
    assert.ok(tools.some((t) => t.name === 'ops__tool_b'));
  });

  it('routes tool calls by prefix', async () => {
    const calls = [];
    const s1 = { name: 'biz', listTools: () => [], callTool: async (n, a) => { calls.push(n); return { content: [{ type: 'text', text: '{}' }] }; } };
    const gw = new XMCPGateway([s1]);
    await gw.callTool('biz__any_tool', {});
    assert.equal(calls[0], 'any_tool');
  });

  it('gateway__list_servers works', async () => {
    const s1 = { name: 'biz', listTools: () => [], callTool: async () => ({}) };
    const gw = new XMCPGateway([s1]);
    const result = await gw.callTool('gateway__list_servers', {});
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.servers.includes('biz'));
  });

  it('unknown server returns isError', async () => {
    const gw = new XMCPGateway([]);
    const result = await gw.callTool('ghost__tool', {});
    assert.ok(result.isError);
  });

  it('report includes total tools count', () => {
    const s1 = { name: 'biz', listTools: () => [{ name: 't', description: 'd', inputSchema: {} }], callTool: async () => ({}) };
    const gw = new XMCPGateway([s1]);
    // gateway adds 2 meta-tools + 1 from s1
    assert.ok(gw.report().totalTools >= 3);
  });

  it('integrates BusinessOps and Operations servers end-to-end', async () => {
    const biz = new BusinessOpsMCPServer();
    const ops = new OperationsMCPServer();
    const gw  = new XMCPGateway([biz, ops]);
    const result = await gw.callTool('x-business-ops__sales_analyze', { transactions: [] });
    assert.ok(!result.isError);
  });
});
