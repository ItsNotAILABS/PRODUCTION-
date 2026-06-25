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
  constructor({ tools, publicTools = {}, rootVault, receipts, port = 8732, aiRegistry = null }) {
    this.tools = tools;          // { tool_name: { description, inputSchema, handler } }
    this.publicTools = publicTools; // tool_name: async fn — no auth required
    this.rootVault = rootVault;
    this.receipts = receipts;
    this.aiRegistry = aiRegistry;
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
          return send(200, { ok: true, port: this.port, tool_count: Object.keys(this.tools).length,
                             public_tools: Object.keys(this.publicTools).length });

        // ── PUBLIC TIER — unauthenticated read-only access ──────────────────
        // Any external AI or HTTP client can call these without a bearer key.
        // Only exposes PUBLIC vault entries and status data.

        if (req.method === 'GET' && url.pathname === '/v1/public/status')
          return send(200, {
            ok: true, product: 'Loom', protocol: 'MEDINA-PROTOCOL/0.5',
            public: true, gated_tool_count: Object.keys(this.tools).length,
            public_tool_count: Object.keys(this.publicTools).length,
            note: 'Public tools require no auth. Issue a bearer key for gated access.',
          });

        if (req.method === 'GET' && url.pathname === '/v1/public/tools')
          return send(200, {
            ok: true, public: true,
            tools: Object.keys(this.publicTools).map(name => ({ name, auth_required: false })),
            auth_hint: 'Request a bearer key from the operator to access all ' +
                       Object.keys(this.tools).length + ' gated tools.',
          });

        if (url.pathname.startsWith('/v1/public/tools/')) {
          const toolName = url.pathname.replace('/v1/public/tools/', '');
          const pub = this.publicTools[toolName];
          if (!pub) return send(404, { ok: false, reason: 'NOT_PUBLIC',
                                       tool: toolName, available: Object.keys(this.publicTools) });
          const body = req.method === 'POST' ? await readJson(req) : {};
          try { return send(200, await pub(body)); }
          catch (e) { return send(500, { ok: false, reason: 'TOOL_THREW', message: e.message }); }
        }

        // List tools (auth-gated, tier-filtered)
        if (req.method === 'GET' && url.pathname === '/v1/tools') {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          const aiRecord = this.aiRegistry?.get?.(auth.agent_id);
          const visible = Object.entries(this.tools).filter(([name]) =>
            !this.aiRegistry || !aiRecord?.ok ||
            this.aiRegistry.permits(auth.agent_id, name)
          );
          return send(200, {
            ok: true, agent_id: auth.agent_id,
            tier: aiRecord?.tier || 'BASIC',
            tools: visible.map(([name, t]) => ({
              name, description: t.description, inputSchema: t.inputSchema,
            })),
          });
        }

        // SELF-INTROSPECTION: who am I, what's my tier, what can I call?
        if (req.method === 'GET' && url.pathname === '/v1/me') {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          const me = this.aiRegistry?.get?.(auth.agent_id);
          if (!me?.ok) return send(200, {
            ok: true, agent_id: auth.agent_id, tier: 'BASIC',
            note: 'Not registered in AI directory yet. Operator can register you.',
          });
          return send(200, me);
        }

        // PROTOCOL DOCUMENTS: how to behave inside Loom
        if (req.method === 'GET' && url.pathname === '/v1/protocol') {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          if (!this.rootVault) return send(200, { ok: true, protocols: [] });
          const docs = [...this.rootVault.entries.values()]
            .filter(e => e.key.startsWith('protocol/'))
            .map(e => ({ key: e.key, kind: e.kind, front_page: e.front_page, ts: e.ts }));
          return send(200, { ok: true, protocols: docs });
        }

        // HANDOFFS: shared/ entries addressed to this agent
        if (req.method === 'GET' && url.pathname === '/v1/handoffs') {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          // Look for vault entries prefixed shared/<them>/<auth.agent_id>/
          // (We don't have direct vault access here; return empty placeholder.)
          return send(200, { ok: true, handoffs: [],
            note: 'Use vault_list with prefix shared/ from /v1/tools/vault_list to find inbound handoffs.' });
        }

        // Invoke a tool
        if (req.method === 'POST' && url.pathname.startsWith('/v1/tools/')) {
          const auth = this._checkAuth(req);
          if (!auth.ok) return send(401, auth);
          const toolName = url.pathname.replace('/v1/tools/', '');
          const tool = this.tools[toolName];
          if (!tool) return send(404, { ok: false, reason: 'TOOL_NOT_FOUND', tool: toolName });

          // ── TIER GATE ───────────────────────────────────────────────
          if (this.aiRegistry && !this.aiRegistry.permits(auth.agent_id, toolName)) {
            return send(403, { ok: false, reason: 'TIER_INSUFFICIENT', tool: toolName,
                                tier: this.aiRegistry.get(auth.agent_id)?.tier || 'BASIC',
                                hint: 'Operator can elevate your tier via ai_registry_set_tier.' });
          }

          const body = await readJson(req);

          // ── MULTI-TENANT ISOLATION ─────────────────────────────────
          const isolated = { ...body, agent_id: auth.agent_id };
          if (typeof isolated.key === 'string' &&
              !isolated.key.startsWith('ai/') &&
              !isolated.key.startsWith('shared/') &&
              !isolated.key.startsWith('operator/')) {
            isolated.key = `ai/${auth.agent_id}/${isolated.key}`;
          }

          // Touch the AI's last-seen + call count
          this.aiRegistry?.touch?.(auth.agent_id);

          const t0 = Date.now();
          let result;
          try { result = await tool.handler(isolated); }
          catch (e) { result = { ok: false, reason: 'TOOL_THREW', message: e.message }; }
          this.receipts?.append({
            kind: 'skill_run', ref: `api:${toolName}`, agent: auth.agent_id,
            meta: { ms: Date.now() - t0, ok: !!result?.ok, via: 'http-gateway',
                    isolated_namespace: `ai/${auth.agent_id}/` },
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
