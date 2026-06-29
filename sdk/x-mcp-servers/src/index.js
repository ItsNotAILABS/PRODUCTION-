/**
 * X MCP Servers — exports
 * Three specialized MCP servers + unified gateway.
 */

export { BusinessOpsMCPServer } from './business-ops-mcp-server.js';
export { OperationsMCPServer }  from './operations-mcp-server.js';
export { PlatformMCPServer }    from './platform-mcp-server.js';
export { XMCPGateway }         from './x-mcp-gateway.js';
export { MCPTransport, MCP_VERSION } from './mcp-transport.js';

export const X_MCP_SERVERS_VERSION = '1.0.0';
