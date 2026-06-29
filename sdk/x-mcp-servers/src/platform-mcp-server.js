/**
 * Platform MCP Server
 * Exposes all registered XPlatformConnectors as MCP tools.
 * Each connector is exposed as platform_execute, platform_health, platform_list_ops.
 */

import { MCPTransport } from './mcp-transport.js';

export class PlatformMCPServer {
  constructor(config = {}) {
    this.name      = 'x-platform';
    this.version   = '1.0.0';
    this.#connectors = new Map();   // name → XPlatformConnector instance
    this.metrics   = { calls: 0, errors: 0 };
    if (config.connectors) {
      for (const [name, connector] of Object.entries(config.connectors)) {
        this.registerConnector(name, connector);
      }
    }
  }

  #connectors;

  /**
   * Register a platform connector.
   * @param {string} name
   * @param {object} connector  XPlatformConnector instance
   */
  registerConnector(name, connector) {
    this.#connectors.set(name, connector);
  }

  listTools() {
    const tools = [
      {
        name: 'platform_execute',
        description: 'Execute an operation on a registered platform connector.',
        inputSchema: {
          type: 'object',
          properties: {
            platform:  { type: 'string', description: 'Platform name (e.g. "shopify", "stripe")' },
            operation: { type: 'string', description: 'Operation key (e.g. "products.list", "payments.charge")' },
            params:    { type: 'object', description: 'Operation-specific parameters' },
          },
          required: ['platform', 'operation'],
        },
      },
      {
        name: 'platform_health',
        description: 'Check the health of a registered platform connector.',
        inputSchema: {
          type: 'object',
          properties: { platform: { type: 'string' } },
          required: ['platform'],
        },
      },
      {
        name: 'platform_list_operations',
        description: 'List all available operations for a platform connector.',
        inputSchema: {
          type: 'object',
          properties: { platform: { type: 'string' } },
          required: ['platform'],
        },
      },
      {
        name: 'platform_list_connectors',
        description: 'List all registered platform connectors and their capabilities.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'platform_connect',
        description: 'Connect a platform connector (establish session / verify credentials).',
        inputSchema: { type: 'object', properties: { platform: { type: 'string' } }, required: ['platform'] },
      },
    ];
    return tools;
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
      case 'platform_execute': {
        const connector = this.#getConnector(args.platform);
        return await connector.execute(args.operation, args.params ?? {});
      }
      case 'platform_health': {
        const connector = this.#getConnector(args.platform);
        return await connector.health();
      }
      case 'platform_list_operations': {
        const connector = this.#getConnector(args.platform);
        return { platform: args.platform, operations: Object.keys(connector._operations()) };
      }
      case 'platform_list_connectors': {
        const list = [];
        for (const [pname, connector] of this.#connectors.entries()) {
          list.push({ name: pname, version: connector.version, capabilities: connector.capabilities });
        }
        return { connectors: list, total: list.length };
      }
      case 'platform_connect': {
        const connector = this.#getConnector(args.platform);
        await connector.connect();
        return { platform: args.platform, connected: true };
      }
      default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
    }
  }

  #getConnector(platform) {
    const c = this.#connectors.get(platform);
    if (!c) throw new Error(`Platform not registered: ${platform}. Available: ${[...this.#connectors.keys()].join(', ')}`);
    return c;
  }

  report() {
    return { server: this.name, version: this.version, connectors: this.#connectors.size, tools: this.listTools().length, metrics: this.metrics };
  }

  start({ stdio = false, http = false, port = 3102 } = {}) {
    const transport = new MCPTransport(this);
    if (stdio) transport.startStdio();
    if (http)  return transport.startHttp(port);
    return transport;
  }
}

export default PlatformMCPServer;
