// api_gateway.mjs — HTTP API for external AIs (ChatGPT, others) to call Loom.
//
// Standalone server (separate port from the dashboard). Speaks REST + an
// OpenAI-functions schema at /.well-known/openai-functions so a custom GPT
// can pull Loom's tool catalog directly.
//
// AUTH: client sends `Authorization: Bearer <key>` where <key> matches a
// stored ROOT entry at `api/keys/<name>` (just the key string). The /admin
// endpoints are operator-only via the same scheme.
//
// CORS: open by default (local-only deploy assumed). For production exposure,
// set MEDINA_API_ALLOWED_ORIGIN.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

export class ApiGateway {
  constructor({ tools, rootVault, receipts, port = 8732 }) {
    this.tools = tools;          // { tool_name: { description, inputSchema, handler } }
    this.rootVault = rootVault;
    this.receipts = receipts;
    this.port = port;
    this.allowedOrigin = process.env.MEDINA_API_ALLOWED_ORIGIN || '*';
    this.server = null;
  }

  _functionSchema() {
    const fns = [];
    for (const [name, t] of Object.entries(this.tools)) {
      fns.push({
        name,
        description: t.description || name,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      });
    }
    return { functions: fns, count: fns.length };
  }

  _checkAuth(req) {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/);
    if (!m) return { ok: false, reason: 'NO_BEARER' };
    const presented = m[1].trim();
    if (!this.rootVault) return { ok: false, reason: 'NO_AUTH_STORE' };
    // Look at every api/keys/* entry; constant-time compare each
    for (const [key, entry] of this.rootVault.entries) {
      if (!key.startsWith('api/keys/')) continue;
      const stored = typeof entry.value === 'string' ? entry.value : entry.value?.key;
      if (!stored) continue;
      if (constantTimeEqual(presented, stored)) {
        return { ok: true, agent_id: entry.value?.agent_id || key.replace('api/keys/', '') };
      }
    }
    return { ok: false, reason: 'INVALID_KEY' };
  }

  start() {
    if (this.server) return { ok: true, already: true, port: this.port };
    this.server = createServer(async (req, res) => {
      const send = (status, body) => {
        res.writeHead(status, {
          'content-type': 'application/json',
          'access-control-allow-origin': this.allowedOrigin,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'OPTIONS') return send(204, {});

      try {
        const url = new URL(req.url, `http://localhost:${this.port}`);

        // OpenAI custom GPT discovery — list available tools.
        if (req.method === 'GET' && url.pathname === '/.well-known/openai-functions')
          return send(200, this._functionSchema());

        // Health
        if (req.method === 'GET' && url.pathname === '/health')
          return send(200, { ok: true, port: this.port, tool_count: Object.keys(this.tools).length });

        // List tools (auth-gated)
        if (req.method === 'GET' && url.pathname === '/v1/tools') {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          return send(200, {
            ok: true, agent_id: auth.agent_id,
            tools: Object.entries(this.tools).map(([name, t]) => ({
              name, description: t.description, inputSchema: t.inputSchema,
            })),
          });
        }

        // Invoke a tool
        if (req.method === 'POST' && url.pathname.startsWith('/v1/tools/')) {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          const toolName = url.pathname.replace('/v1/tools/', '');
          const tool = this.tools[toolName];
          if (!tool) return send(404, { ok: false, reason: 'TOOL_NOT_FOUND', tool: toolName });
          const body = await readJson(req);
          const t0 = Date.now();
          const result = await tool.handler(body || {});
          this.receipts?.append({
            kind: 'skill_run', ref: `api:${toolName}`, agent: auth.agent_id,
            meta: { ms: Date.now() - t0, ok: !!result?.ok, via: 'http-gateway' },
          });
          return send(200, result);
        }

        return send(404, { ok: false, reason: 'NOT_FOUND', path: url.pathname });
      } catch (e) {
        send(500, { ok: false, reason: 'INTERNAL', message: e.message });
      }
    });
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.error(`[loom-api] listening on http://localhost:${this.port}`);
        resolve({ ok: true, port: this.port });
      });
    });
  }

  async stop() {
    if (!this.server) return { ok: true };
    return new Promise(r => this.server.close(() => { this.server = null; r({ ok: true }); }));
  }
}

/** Issue a new API key, store it in ROOT under api/keys/<name>. */
export function issueApiKey({ rootVault, name, agent_id, operator }) {
  if (!name) return { ok: false, reason: 'NAME_REQUIRED' };
  const key = 'lk_' + randomBytes(24).toString('base64url');
  const r = rootVault.write({
    key: `api/keys/${name}`,
    kind: 'note',
    agent_id: agent_id || 'system',
    operator,
    value: { key, name, agent_id: agent_id || name, created: Date.now() },
  });
  if (!r.ok) return r;
  return { ok: true, name, key,
           use: `Authorization: Bearer ${key}`,
           note: 'Store this key securely — it will not be retrievable through any operator-visible tool.' };
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
