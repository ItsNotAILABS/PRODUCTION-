/**
 * MCP Transport — JSON-RPC 2.0 transport layer for Model Context Protocol servers.
 * Supports stdio (default) and HTTP transports.
 * Spec: https://modelcontextprotocol.io/specification
 */

import { createServer } from 'http';
import { createInterface } from 'readline';

export const MCP_VERSION = '2024-11-05';

export class MCPTransport {
  constructor(server) {
    this.server = server;
  }

  /**
   * Start stdio transport — reads JSON-RPC from stdin, writes to stdout.
   * This is the standard MCP transport for CLI-launched servers.
   */
  startStdio() {
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let request;
      try { request = JSON.parse(trimmed); } catch { return; }
      const response = await this.#handle(request);
      if (response !== null) process.stdout.write(JSON.stringify(response) + '\n');
    });
    rl.on('close', () => process.exit(0));
  }

  /**
   * Start HTTP transport — serves JSON-RPC over POST /mcp.
   * @param {number} [port=3100]
   * @returns {import('http').Server}
   */
  startHttp(port = 3100) {
    const httpServer = createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405); res.end('Method Not Allowed'); return;
      }
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', async () => {
        let request;
        try { request = JSON.parse(body); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.#error(null, -32700, 'Parse error')));
          return;
        }
        const response = await this.#handle(request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
    });
    httpServer.listen(port);
    return httpServer;
  }

  async #handle(request) {
    const { id, method, params } = request;
    try {
      const result = await this.#dispatch(method, params ?? {});
      if (result === undefined) return null;  // notification
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      return this.#error(id, err.code ?? -32603, err.message);
    }
  }

  async #dispatch(method, params) {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: MCP_VERSION,
          capabilities:    { tools: {} },
          serverInfo:      { name: this.server.name, version: this.server.version },
        };
      case 'notifications/initialized': return undefined;
      case 'tools/list':   return { tools: this.server.listTools() };
      case 'tools/call':   return await this.server.callTool(params.name, params.arguments ?? {});
      case 'ping':         return {};
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }

  #error(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

export default MCPTransport;
