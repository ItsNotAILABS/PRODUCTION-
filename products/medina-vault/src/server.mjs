#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// server.mjs — MEDINA VAULT MCP server.
//
// MEANING:     A single-file MCP stdio server that exposes the Medina
//              4-tier vault to any AI tool speaking Model Context Protocol
//              (Claude Desktop, Cursor, Cline, Continue, Zed, …).
// MODEL:       JSON-RPC 2.0 over stdio. MCP 2024-11-05 wire format.
// COMPUTATION: For each tool call → vault.<op>() → laws middleware →
//              persist on success.
// EXECUTION:   `node src/server.mjs`  or  `medina-vault` (bin entry).
//              Configure in Claude Desktop / Cursor as an MCP server.
//
// Zero-dependency. Node ≥ 20. MIT.
// ─────────────────────────────────────────────────────────────────────────

import { stdin, stdout, stderr, argv, env } from 'node:process';
import { MedinaVault } from './vault.mjs';
import { defaultVaultPath, loadSnapshot, saveSnapshot } from './snapshot.mjs';
import { hashEntry, medinaHash } from './laws.mjs';
import { chartManifest } from '../charter/charter.mjs';
import { PRO_TOOLS, PRO_STATUS } from './pro.mjs';
import { Custos } from './custos.mjs';
import { TokenLedger, tokenValue } from './tokens.mjs';
import { KeyVault } from './keys.mjs';
import { SkillRegistry } from './skills.mjs';
import { WorkflowRunner } from './workflows.mjs';
import { fingerprint, encodeFP, decodeFP, rankBySimilarity } from './spectral.mjs';
import { promises as fsp } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Identity ────────────────────────────────────────────────────────────

const SERVER_NAME    = 'medina-vault';
const SERVER_VERSION = '0.1.0';
const PROTOCOL       = 'MEDINA-PROTOCOL/0.1';
const MCP_VERSION    = '2024-11-05';

// ── State ────────────────────────────────────────────────────────────────

const VAULT_PATH = defaultVaultPath();
const vault = new MedinaVault();
const existing = await loadSnapshot(VAULT_PATH).catch(() => null);
if (existing) vault.loadFromJSON(existing);

// Custos — the intelligence entity inside (PROTOCOL_08)
const custos = new Custos();
await custos.load();

// Token ledger (PROTOCOL_09) — persisted in vault.json::_meta
const tokens = new TokenLedger();
tokens.loadFromMeta(existing?._meta);

// API key vault (encrypted at rest)
const keys = new KeyVault();
keys.loadFromMeta(existing?._meta);

// Skills + workflows
const skills    = new SkillRegistry();
const workflows = new WorkflowRunner({ registry: skills });

// Protocols directory (resolved relative to this server file)
const PROTOCOLS_DIR = (() => {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'protocols');
  } catch { return null; }
})();

// One operator per node (the human installing the app).
// Defaults to the OS user. Override with MEDINA_OPERATOR_ID env var.
const OPERATOR_ID = env.MEDINA_OPERATOR_ID || env.USER || env.USERNAME || 'operator';

// AIs identify themselves on each call. If not provided, the AI is
// assumed to be acting AS the operator (single-user single-AI setup).
const defaultRequester = (args) => args?.agent_id || OPERATOR_ID;

async function persist() {
  try {
    // Merge token ledger into vault snapshot under _meta.
    const snap = vault.toJSON();
    snap._meta = {
      ...(snap._meta || {}),
      ...tokens.toMeta(),
      ...keys.toMeta(),
      custos: { online: true, last_persist: Date.now() },
    };
    await saveSnapshot(snap, VAULT_PATH);
    await custos.persist();
  } catch (e) { stderr.write(`[medina-vault] persist failed: ${e.message}\n`); }
}

// ── Tools the server exposes ────────────────────────────────────────────

const tools = {
  vault_store: {
    description:
      'Write a memory entry. RECITAL_PLUS_ONE: if updating an existing key, you should pass prior_hash from the last retrieve. Tiers: PUBLIC | SHARED | PRIVATE | SOVEREIGN.',
    inputSchema: {
      type: 'object',
      properties: {
        key:        { type: 'string', description: 'Unique key for this memory.' },
        value:      { description: 'The memory payload (any JSON value).' },
        tier:       { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'], default: 'PRIVATE' },
        agent_id:   { type: 'string', description: 'The AI agent ID writing this. Defaults to the operator.' },
        prior_hash: { type: 'string', description: 'Hash of the prior entry for RECITAL_PLUS_ONE. Omit on first write.' },
        ttl_ms:     { type: 'number', description: 'Override default TTL.' },
        metadata:   { type: 'object', description: 'Free-form metadata.' },
        shared_with:{ type: 'array', items: { type: 'string' } },
      },
      required: ['key', 'value'],
    },
    handler: async (a) => {
      const requester = defaultRequester(a);
      const r = vault.store({
        key: a.key, value: a.value,
        tier: a.tier || 'PRIVATE',
        ownerId: requester,
        prior_hash: a.prior_hash,
        ttlMs: a.ttl_ms,
        metadata: a.metadata,
        sharedWith: a.shared_with,
      });
      if (r.ok) {
        const earned = tokens.award(requester, { tier: r.entry.tier, lineageDepth: r.lineage_depth });
        custos.observeWrite({ agentId: requester, tier: r.entry.tier, key: r.entry.key, lineageDepth: r.lineage_depth });
        await persist();
        r.tokens_earned = earned;
        r.medina_hash = medinaHash(r.entry);
      }
      return r;
    },
  },

  vault_retrieve: {
    description: 'Read a memory entry by key. Returns the entry plus its head_hash (use as prior_hash on the next store of this key).',
    inputSchema: {
      type: 'object',
      properties: {
        key:      { type: 'string' },
        agent_id: { type: 'string' },
      },
      required: ['key'],
    },
    handler: async (a) => {
      const requester = defaultRequester(a);
      const r = vault.retrieve(a.key, requester);
      custos.observeRead({ agentId: requester, key: a.key, ok: r.ok });
      await custos.persist();
      if (r.ok) return { ...r, head_hash: hashEntry(r.entry), medina_hash: medinaHash(r.entry) };
      return r;
    },
  },

  vault_share: {
    description: 'Share a PRIVATE entry with another agent. Owner only. SOVEREIGN entries cannot be shared.',
    inputSchema: {
      type: 'object',
      properties: {
        key:             { type: 'string' },
        agent_id:        { type: 'string', description: 'Owner agent ID (defaults to operator).' },
        target_agent_id: { type: 'string' },
      },
      required: ['key', 'target_agent_id'],
    },
    handler: async (a) => {
      const r = vault.share(a.key, defaultRequester(a), a.target_agent_id);
      if (r.ok) await persist();
      return r;
    },
  },

  vault_promote: {
    description: 'Promote an entry to a higher tier. Owner only. Promoting to SOVEREIGN clears all shares.',
    inputSchema: {
      type: 'object',
      properties: {
        key:      { type: 'string' },
        new_tier: { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
        agent_id: { type: 'string' },
      },
      required: ['key', 'new_tier'],
    },
    handler: async (a) => {
      const r = vault.promote(a.key, defaultRequester(a), a.new_tier);
      if (r.ok) await persist();
      return r;
    },
  },

  vault_list: {
    description: 'List entries visible to the requester. Optional filters: tier, key prefix.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        tier:     { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
        prefix:   { type: 'string' },
      },
    },
    handler: async (a) => ({
      ok: true,
      entries: vault.list(defaultRequester(a), { tier: a.tier, prefix: a.prefix }),
    }),
  },

  vault_sweep: {
    description: 'Run TTL + φ-decay sweep. Returns counts of removed entries.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const r = vault.sweep();
      await persist();
      return { ok: true, ...r };
    },
  },

  vault_search: {
    description: 'Search entries by query (key/value substring) and/or tag, filtered by tier. Results ranked by match × φ-strength. Use when you do not know the exact key.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Substring matched against key and stringified value (case-insensitive).' },
        tag:      { type: 'string', description: 'Match an entry whose metadata.tags includes this tag.' },
        tier:     { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
        limit:    { type: 'number', description: 'Max results (default 20).' },
        agent_id: { type: 'string' },
      },
    },
    handler: async (a) => ({
      ok: true,
      results: vault.search(defaultRequester(a), {
        query: a.query, tag: a.tag, tier: a.tier, limit: a.limit,
      }),
    }),
  },

  vault_lineage: {
    description: 'Return the RECITAL_PLUS_ONE hash chain for a key — genesis → … → head. Use this to audit a memory\'s history or recover from RECITAL_MISMATCH.',
    inputSchema: {
      type: 'object',
      properties: {
        key:      { type: 'string' },
        agent_id: { type: 'string' },
      },
      required: ['key'],
    },
    handler: async (a) => vault.lineage(a.key, defaultRequester(a)),
  },

  vault_status: {
    description: 'Report node status + the Alpha Charter manifest embedded at runtime: protocol, operator, tier counts, vault path, pricing, license.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({
      ok: true,
      protocol: PROTOCOL,
      operator: OPERATOR_ID,
      vault_path: VAULT_PATH,
      tiers: vault.status(),
      charter: chartManifest(),
      pro_licensed: PRO_STATUS.licensed(),
      custos: custos.status(),
    }),
  },

  vault_custos: {
    description: 'Read what the in-vault intelligence entity has observed about you. Returns engagement, whether you read SOVEREIGN preferences this session, writes by tier, last observation. PROTOCOL_08.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
    },
    handler: async (a) => {
      const requester = defaultRequester(a);
      const v = custos.view(requester);
      const needs = custos.needsNudge(requester);
      return { ok: true, ...v, needs_nudge: needs,
               protocol: 'PROTOCOL_08',
               hint: needs
                 ? 'You have not read operator/preferences/* this session. Read them before proceeding.'
                 : 'Engagement healthy. Carry on.' };
    },
  },

  vault_tokens: {
    description: 'Memory token balance for an agent on this node. Formula: tier_weight × (1 + lineage_depth · φ⁻¹). PROTOCOL_09.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
    },
    handler: async (a) => tokens.view(defaultRequester(a)),
  },

  vault_leaderboard: {
    description: 'Top agents by token balance on this node.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
    handler: async (a) => ({ ok: true, leaderboard: tokens.leaderboard(a.limit) }),
  },

  vault_protocols: {
    description: 'List the 10 Medina protocols governing this node. Returns id, name, layer, binding. AIs should read 01-05 before writing.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const out = [];
      if (PROTOCOLS_DIR) {
        try {
          const files = (await fsp.readdir(PROTOCOLS_DIR)).filter(f => /^PROTOCOL-\d/.test(f)).sort();
          for (const f of files) {
            const text = await fsp.readFile(join(PROTOCOLS_DIR, f), 'utf8');
            const header = text.match(/<!--([\s\S]*?)-->/)?.[1] ?? '';
            const idM    = header.match(/id:\s*(\d+)/);
            const nameM  = header.match(/name:\s*(\w+)/);
            const layerM = header.match(/layer:\s*(\w+)/);
            out.push({
              id: idM ? Number(idM[1]) : null,
              name: nameM ? nameM[1] : null,
              layer: layerM ? layerM[1] : null,
              file: f,
              path: join(PROTOCOLS_DIR, f),
            });
          }
        } catch { /* no protocols dir on this machine */ }
      }
      return { ok: true, protocol_version: 'MEDINA-PROTOCOL/0.2', count: out.length, protocols: out };
    },
  },

  // ── API KEYS (encrypted at rest with AES-256-GCM) ───────────────────

  keys_set: {
    description: 'Store an API key encrypted at rest. Master key derived from operator+machine. Value never returns through MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'e.g. "openai", "anthropic", "sendgrid"' },
        value:    { type: 'string', description: 'The secret. Encrypted immediately; not persisted in plaintext.' },
        metadata: { type: 'object' },
      },
      required: ['name', 'value'],
    },
    handler: async (a) => { const r = keys.set(a.name, a.value, a.metadata); if (r.ok) await persist(); return r; },
  },

  keys_list: {
    description: 'List stored API keys by name with usage stats. Plaintext values are NEVER returned.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, keys: keys.list() }),
  },

  keys_describe: {
    description: 'Get safe metadata for one key: fingerprint, addedAt, lastUsedAt, usageCount.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async (a) => keys.describe(a.name),
  },

  keys_delete: {
    description: 'Permanently remove a stored API key from the vault.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async (a) => { const r = keys.delete(a.name); if (r.ok) await persist(); return r; },
  },

  // ── SKILLS (callable production work) ───────────────────────────────

  skills_list: {
    description: 'List skills available on this node. Each entry includes name, description, JSON Schema for input.',
    inputSchema: {
      type: 'object',
      properties: { prefix: { type: 'string', description: 'Filter by name prefix, e.g. "legal."' } },
    },
    handler: async (a) => ({ ok: true, skills: skills.list({ prefix: a.prefix }) }),
  },

  skills_run: {
    description: 'Run a named skill. Returns the skill output, often a PDF as bytes_base64 + filename. Stores the artifact in vault under artifact/<name>/<timestamp>.',
    inputSchema: {
      type: 'object',
      properties: {
        name:     { type: 'string' },
        input:    { type: 'object' },
        agent_id: { type: 'string' },
        store:    { type: 'boolean', default: true, description: 'If true, persist the artifact summary in vault.' },
      },
      required: ['name'],
    },
    handler: async (a) => {
      const requester = defaultRequester(a);
      const r = skills.run(a.name, a.input || {}, { agent_id: requester });
      if (r.ok && a.store !== false) {
        const key = `artifact/${a.name}/${Date.now()}`;
        const stored = vault.store({
          key, value: { skill: a.name, summary: r.summary, filename: r.filename, bytes: r.bytes },
          tier: 'PRIVATE', ownerId: requester,
          metadata: { tags: ['artifact', a.name.split('.')[0]], source: 'skills_run' },
        });
        if (stored.ok) {
          tokens.award(requester, { tier: 'PRIVATE', lineageDepth: stored.lineage_depth });
          custos.observeWrite({ agentId: requester, tier: 'PRIVATE', key, lineageDepth: stored.lineage_depth });
          r.stored_at = key;
        }
        await persist();
      }
      return r;
    },
  },

  skills_history: {
    description: 'Recent skill runs on this node (timestamps, durations, ok/fail).',
    inputSchema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Optional skill name filter.' },
        limit: { type: 'number', default: 20 },
      },
    },
    handler: async (a) => ({ ok: true, runs: skills.history({ name: a.name, limit: a.limit }) }),
  },

  // ── WORKFLOWS (skill chains) ────────────────────────────────────────

  workflows_run: {
    description: 'Run a workflow — a DAG of skill calls with output binding. Supports ${node.field} substitution and ${node.field|hash}.',
    inputSchema: {
      type: 'object',
      properties: {
        definition: {
          type: 'object',
          properties: {
            id:    { type: 'string' },
            nodes: { type: 'array', items: { type: 'object',
              properties: {
                id:    { type: 'string' },
                skill: { type: 'string' },
                input: { type: 'object' },
                continue_on_error: { type: 'boolean' },
              }, required: ['id', 'skill']
            }},
          },
          required: ['id', 'nodes'],
        },
        agent_id: { type: 'string' },
      },
      required: ['definition'],
    },
    handler: async (a) => workflows.run(a.definition, { agent_id: defaultRequester(a) }),
  },

  workflows_status: {
    description: 'Recent workflow runs with per-node ok/reason/summary.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
    handler: async (a) => ({ ok: true, runs: workflows.status({ limit: a.limit }) }),
  },

  // ── SEMANTIC RECALL via φ-spectral fingerprints ─────────────────────

  vault_fingerprint: {
    description: 'Compute a 64-dim φ-spectral fingerprint of an arbitrary text. Base64-encoded float32. Used by vault_similar.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    handler: async (a) => ({ ok: true, fingerprint: encodeFP(fingerprint(a.text)), dim: 64 }),
  },

  vault_similar: {
    description: 'Find entries similar to a query string (or fingerprint). Cosine similarity over φ-spectral fingerprints, ranked × φ-decay strength. DUAL_READ-authorized per entry.',
    inputSchema: {
      type: 'object',
      properties: {
        text:      { type: 'string', description: 'Query text (preferred).' },
        agent_id:  { type: 'string' },
        tier:      { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
        limit:     { type: 'number', default: 10 },
        min_score: { type: 'number', default: 0.15 },
      },
      required: ['text'],
    },
    handler: async (a) => {
      const requester = defaultRequester(a);
      const candidates = vault.list(requester, { tier: a.tier }).map(c => ({
        ...c,
        value: c.metadata?._preview ?? c.snippet ?? c.key,
      }));
      // Use full snippet for fingerprinting: re-derive from vault.search browse-mode.
      const browse = vault.search(requester, { tier: a.tier, limit: 500 });
      const ranked = rankBySimilarity(a.text, browse, { limit: a.limit, minScore: a.min_score });
      return { ok: true, results: ranked };
    },
  },

  // PRO bridge tools — advertised in tools/list. Without MEDINA_PRO_LICENSE
  // they return { ok:false, reason:'UPGRADE_REQUIRED' } so the AI sees the
  // upgrade path as a structured value, not a missing tool.
  ...PRO_TOOLS,
};

// ── JSON-RPC stdio framing ───────────────────────────────────────────────
// MCP uses newline-delimited JSON over stdio.

function send(message) {
  stdout.write(JSON.stringify(message) + '\n');
}

function reply(id, result)        { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, msg){ send({ jsonrpc: '2.0', id, error: { code, message: msg } }); }

// MCP tool calls expect content as text blocks; we return JSON-stringified
// payloads so the AI gets a structured result it can parse.
function toolContent(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: payload?.ok === false,
  };
}

// ── Method dispatch ──────────────────────────────────────────────────────

async function handle(message) {
  const { id, method, params } = message;

  // Notifications (no id) — just acknowledge silently.
  if (method === 'notifications/initialized') return;
  if (id == null) return;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Medina Vault — sovereign 4-tier AI memory under MEDINA-PROTOCOL/0.1. ' +
          'Laws compiled at runtime: RECITAL_PLUS_ONE (write lineage), DUAL_READ ' +
          '(retrieve auth), φ-DECAY (memory ages by tier). Use prior_hash from the ' +
          'last retrieve when updating an existing key.',
      });

    case 'tools/list':
      return reply(id, {
        tools: Object.entries(tools).map(([name, t]) => ({
          name, description: t.description, inputSchema: t.inputSchema,
        })),
      });

    case 'tools/call': {
      const t = tools[params?.name];
      if (!t) return replyError(id, -32601, `Unknown tool: ${params?.name}`);
      try {
        const out = await t.handler(params.arguments ?? {});
        return reply(id, toolContent(out));
      } catch (e) {
        return reply(id, toolContent({ ok: false, reason: 'INTERNAL_ERROR', message: e.message }));
      }
    }

    default:
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

// ── stdio loop ───────────────────────────────────────────────────────────

let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', async (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      await handle(msg);
    } catch (e) {
      stderr.write(`[medina-vault] bad message: ${e.message}\n`);
    }
  }
});

stdin.on('end', () => process.exit(0));

stderr.write(
  `[medina-vault] online · protocol=${PROTOCOL} · operator=${OPERATOR_ID} · vault=${VAULT_PATH}\n`
);

// ── CLI smoke (--smoke) ──────────────────────────────────────────────────
// `node src/server.mjs --smoke` skips MCP and just exercises the laws.
if (argv.includes('--smoke')) {
  await (await import('./_smoke.mjs')).run({ vault, persist });
  process.exit(0);
}
