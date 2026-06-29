/**
 * X MCP Gateway — Routes MCP tool calls across all registered MCP servers.
 * Provides a unified tool namespace with server-prefix routing.
 * Start via HTTP: new XMCPGateway([...]).start({ http: true, port: 3099 })
 */

import { MCPTransport } from './mcp-transport.js';

export class XMCPGateway {
  constructor(servers = []) {
    this.name    = 'x-mcp-gateway';
    this.version = '1.0.0';
    this.#servers = new Map();
    this.metrics  = { calls: 0, routes: 0, errors: 0 };
    for (const server of servers) this.registerServer(server);
  }

  #servers;

  /**
   * Register a downstream MCP server.
   * @param {{ name: string, listTools(): object[], callTool(name, args): Promise<object> }} server
   */
  registerServer(server) {
    this.#servers.set(server.name, server);
  }

  listTools() {
    const tools = [];
    for (const [serverName, server] of this.#servers.entries()) {
      for (const tool of server.listTools()) {
        tools.push({
          ...tool,
          name:        `${serverName}__${tool.name}`,
          description: `[${serverName}] ${tool.description}`,
        });
      }
    }
    // Gateway meta-tools
    tools.push({
      name: 'gateway__list_servers',
      description: 'List all registered MCP servers in the gateway.',
      inputSchema: { type: 'object', properties: {} },
    });
    tools.push({
      name: 'gateway__server_report',
      description: 'Get health report for a specific MCP server.',
      inputSchema: { type: 'object', properties: { serverName: { type: 'string' } }, required: ['serverName'] },
    });
    return tools;
  }

  async callTool(name, args) {
    this.metrics.calls++;
    try {
      if (name === 'gateway__list_servers') {
        return { content: [{ type: 'text', text: JSON.stringify({ servers: [...this.#servers.keys()] }, null, 2) }] };
      }
      if (name === 'gateway__server_report') {
        const server = this.#servers.get(args.serverName);
        if (!server) throw new Error(`Server not found: ${args.serverName}`);
        const report = server.report?.() ?? { name: args.serverName };
        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
      }

      // Route by prefix: "serverName__toolName"
      const sep = name.indexOf('__');
      if (sep === -1) throw new Error(`Invalid tool name format (expected server__tool): ${name}`);
      const serverName = name.slice(0, sep);
      const toolName   = name.slice(sep + 2);
      const server = this.#servers.get(serverName);
      if (!server) throw new Error(`Server not found: ${serverName}`);

      this.metrics.routes++;
      return await server.callTool(toolName, args);
    } catch (err) {
      this.metrics.errors++;
      return { content: [{ type: 'text', text: `Gateway error: ${err.message}` }], isError: true };
    }
  }

  report() {
    return {
      gateway: this.name,
      version: this.version,
      servers: this.#servers.size,
      totalTools: this.listTools().length,
      metrics: this.metrics,
    };
  }

  start({ stdio = false, http = false, port = 3099 } = {}) {
    const transport = new MCPTransport(this);
    if (stdio) transport.startStdio();
    if (http)  return transport.startHttp(port);
    return transport;
  }
}

export default XMCPGateway;
