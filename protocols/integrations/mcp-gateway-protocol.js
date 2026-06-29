/**
 * PROTO-I001: MCP Gateway Protocol (MGP)
 * Derives from: AlphaToolsProtocol, OrchestrationProtocol
 * Registers and routes MCP tool calls across multiple servers with phi-weighted load balancing.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class MCPGatewayProtocol {
  #servers   = new Map(); // serverName → { server, tools: Set, load: number, callCount: number }
  #toolIndex = new Map(); // toolName → serverName[]

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.timeout  = config.timeout ?? 30_000;
    this.metrics  = { registered: 0, routed: 0, failed: 0, avgLatencyMs: 0 };
  }

  /** Register a server and its available tools. */
  register(serverName, server) {
    const tools = new Set(typeof server.listTools === 'function' ? server.listTools() : (server.tools ?? []));
    this.#servers.set(serverName, { server, tools, load: 0, callCount: 0 });
    for (const tool of tools) {
      if (!this.#toolIndex.has(tool)) this.#toolIndex.set(tool, []);
      this.#toolIndex.get(tool).push(serverName);
    }
    this.metrics.registered++;
    return { serverName, toolCount: tools.size };
  }

  /** Route a tool call to the optimal server using phi-weighted load balancing. */
  async route(toolName, args = {}) {
    const candidates = this.#toolIndex.get(toolName);
    if (!candidates || candidates.length === 0) {
      this.metrics.failed++;
      throw new Error(`No server registered for tool: ${toolName}`);
    }

    const serverName = this.#selectServer(candidates);
    const entry      = this.#servers.get(serverName);
    entry.load++;

    const t0 = Date.now();
    try {
      const result    = await entry.server[toolName]?.(args) ?? await entry.server.call?.(toolName, args);
      const latencyMs = Date.now() - t0;
      entry.callCount++;
      entry.load = Math.max(0, entry.load - 1);
      this.#updateLatency(latencyMs);
      this.metrics.routed++;
      return { server: serverName, result, latencyMs };
    } catch (err) {
      entry.load = Math.max(0, entry.load - 1);
      this.metrics.failed++;
      throw err;
    }
  }

  /** Return a flat deduplicated list of all registered tools. */
  listAllTools() {
    return [...this.#toolIndex.entries()].map(([tool, servers]) => ({
      tool,
      servers,
      serverCount: servers.length,
    }));
  }

  /** Phi-weighted server selection: servers with lower load * phi score win. */
  #selectServer(candidates) {
    let best = null, bestScore = Infinity;
    for (const name of candidates) {
      const entry = this.#servers.get(name);
      if (!entry) continue;
      // Higher callCount → slight preference (warmer path); higher load → penalty
      const score = (entry.load + 1) / (1 + entry.callCount * PHI_INV);
      if (score < bestScore) { bestScore = score; best = name; }
    }
    return best ?? candidates[0];
  }

  #updateLatency(latencyMs) {
    const n = this.metrics.routed + 1;
    this.metrics.avgLatencyMs = (this.metrics.avgLatencyMs * (n - 1) + latencyMs) / n;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default MCPGatewayProtocol;
