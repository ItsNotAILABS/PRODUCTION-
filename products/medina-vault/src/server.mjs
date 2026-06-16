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
import { SessionGraph } from './graph.mjs';
import { KnowledgeLedger } from './knowledge_tokens.mjs';
import { SkillSandbox } from './sandbox.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { buildGitHubSkills } from './integrations/github.mjs';
import { Workspace } from './workspace.mjs';
import { PlanLedger } from './plans.mjs';
import { ContextLog } from './context.mjs';
import { MemoryConsolidator } from './consolidation.mjs';
import { Reinforcement } from './reinforcement.mjs';
import { SkillCache } from './cache.mjs';
import { BudgetTracker } from './budget.mjs';
import { EfficiencyEngine } from './efficiency.mjs';
import { FailureRegistry } from './failures.mjs';
import { promises as fsp } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Identity ────────────────────────────────────────────────────────────

const SERVER_NAME    = 'loom';
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

// Skills + workflows. Pass vault/custos so memory.* skills can read/write live state.
const skills    = new SkillRegistry({ vault, custos });

// Knowledge layer (PROTOCOL_11..14): graph, knowledge tokens, sandbox, receipts, integrations
const graph     = new SessionGraph();   graph.loadFromMeta(existing?._meta);
const knowledge = new KnowledgeLedger(); knowledge.loadFromMeta(existing?._meta);
const receipts  = new ReceiptLedger();  receipts.loadFromMeta(existing?._meta);
// Register GitHub integration skills using stored 'github' key.
for (const s of buildGitHubSkills({ keys, receipts })) skills.register(s);
const workflows = new WorkflowRunner({ registry: skills });
const sandbox   = new SkillSandbox({ registry: skills, runner: workflows });
sandbox.loadFromMeta(existing?._meta);

// AI workspace layer (PROTOCOL_15..19): workspace, plans, context, consolidation, reinforcement
const workspace     = new Workspace();    workspace.loadFromMeta(existing?._meta);
const plans         = new PlanLedger();   plans.loadFromMeta(existing?._meta);
const ctxLog        = new ContextLog();   ctxLog.loadFromMeta(existing?._meta);
const reinforcement = new Reinforcement(); reinforcement.loadFromMeta(existing?._meta);
const consolidator  = new MemoryConsolidator({ vault, receipts, graph });

// Efficiency layer (PROTOCOL_20..21): skill cache + budget tracker
const cache  = new SkillCache();    cache.loadFromMeta(existing?._meta);
const budget = new BudgetTracker(); budget.loadFromMeta(existing?._meta);
const efficiency = new EfficiencyEngine({ receipts, registry: skills });
efficiency.loadFromMeta(existing?._meta);
const failures = new FailureRegistry({ receipts });
failures.loadFromMeta(existing?._meta);

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
    // Persist custom template skills.
    const customTemplates = [];
    for (const s of skills.skills.values()) {
      if (s.template) customTemplates.push({
        name: s.name, description: s.description,
        template: s.run.toString().match(/`([^`]*)`/)?.[1] ?? '',
        inputSchema: s.inputSchema,
      });
    }
    snap._meta = {
      ...(snap._meta || {}),
      ...tokens.toMeta(),
      ...keys.toMeta(),
      ...graph.toMeta(),
      ...knowledge.toMeta(),
      ...sandbox.toMeta(),
      ...receipts.toMeta(),
      ...workspace.toMeta(),
      ...plans.toMeta(),
      ...ctxLog.toMeta(),
      ...reinforcement.toMeta(),
      ...cache.toMeta(),
      ...budget.toMeta(),
      ...efficiency.toMeta(),
      ...failures.toMeta(),
      custom_skills: customTemplates,
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
        // Graph: ensure entry + agent nodes, edge to current session
        const entryId = `entry:${r.entry.key}`;
        graph.addNode({ id: entryId, kind: 'entry', label: r.entry.key, tier: r.entry.tier });
        graph.addNode({ id: `agent:${requester}`, kind: 'agent', label: requester });
        graph.link(`agent:${requester}`, entryId, 'observed');
        graph.link(entryId, graph.session.id, 'belongs_to');
        receipts.append({ kind: 'vault_store', ref: r.entry.key, agent: requester,
                          meta: { tier: r.entry.tier, lineage_depth: r.lineage_depth, hash: r.head_hash } });
        // System observes the vault write and fires any applicable efficiency receipts.
        efficiency.observe({ type: 'vault_post', key: r.entry.key, value: r.entry.value,
                             tier: r.entry.tier, dedup: false });
        await persist();
        r.tokens_earned = earned;
        r.medina_hash = medinaHash(r.entry);
      } else if (r.reason === 'RECITAL_MISMATCH' || r.reason === 'DUPLICATE') {
        efficiency.observe({ type: 'vault_post', key: a.key, value: a.value,
                             tier: a.tier || 'PRIVATE', dedup: true });
        const kindMap = { RECITAL_MISMATCH: 'vault_recital_mismatch',
                          GENESIS_EXPECTS_EMPTY: 'vault_genesis_expects_empty',
                          INVALID_TIER: 'vault_invalid_tier',
                          SOVEREIGN_OWNER_ONLY: 'vault_sovereign_owner_only',
                          TIER_FORBIDDEN: 'vault_tier_forbidden' };
        failures.observe({ kind: kindMap[r.reason] || 'unknown', reason: r.reason,
                           agent: requester, input: { key: a.key, tier: a.tier } });
      } else if (!r.ok) {
        failures.observe({ kind: 'unknown', reason: r.reason || 'UNKNOWN',
                           agent: requester, input: { key: a.key, tier: a.tier } });
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
    handler: async (a) => {
      const r = keys.set(a.name, a.value, a.metadata);
      if (r.ok) { receipts.append({ kind: 'key_set', ref: a.name, agent: 'operator', meta: { fingerprint: r.fingerprint } });
                  await persist(); }
      return r;
    },
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
    description: 'List skills available on this node. Each entry includes name, description, JSON Schema for input, and domain.',
    inputSchema: {
      type: 'object',
      properties: { prefix: { type: 'string', description: 'Filter by name prefix, e.g. "legal." or "finance."' } },
    },
    handler: async (a) => ({ ok: true, skills: skills.list({ prefix: a.prefix }) }),
  },

  skills_domains: {
    description: 'List skill domains (legal, writing, code, finance, etc.) with skill counts.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, domains: skills.domains(), total: skills.list().length }),
  },

  skills_register_template: {
    description: 'Register a template skill at runtime. Template is mustache-style ${field} text that gets filled from input. Persisted across server restarts in vault::_meta.custom_skills.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'e.g. "ops.runbook_outage"' },
        description: { type: 'string' },
        template:    { type: 'string', description: 'Mustache-style template; ${field} placeholders.' },
        inputSchema: { type: 'object' },
      },
      required: ['name', 'template'],
    },
    handler: async (a) => {
      const r = skills.registerTemplate(a);
      if (r.ok) await persist();
      return r;
    },
  },

  workflows_library: {
    description: 'List prebuilt workflow templates. Returns id, description, nodes, and the input variables each requires.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const { listWorkflows } = await import('./skills/workflows_library.mjs');
      return { ok: true, workflows: listWorkflows() };
    },
  },

  workflows_get: {
    description: 'Get a single workflow definition from the library by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => {
      const { WORKFLOW_LIBRARY } = await import('./skills/workflows_library.mjs');
      const wf = WORKFLOW_LIBRARY[a.id];
      return wf ? { ok: true, workflow: wf } : { ok: false, reason: 'WORKFLOW_NOT_FOUND' };
    },
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
      // Efficiency: try cache first
      const cached = cache.get(a.name, a.input || {});
      let r, fromCache = false, ms = 0;
      if (cached) { r = { ...cached, _cache_hit: true }; fromCache = true; }
      else {
        const t0 = Date.now();
        r = await skills.run(a.name, a.input || {}, { agent_id: requester });
        ms = Date.now() - t0;
        cache.set(a.name, a.input || {}, r, { ms });
      }
      // Budget tracking
      const budgetResult = budget.record(requester, a.name, { input: a.input, output: r });
      const budgetCheck  = budget.check(requester);
      // System observes the event and writes efficiency receipts itself.
      efficiency.observe({ type: 'skill_post', skill: a.name, input: a.input,
                           output: r, ms, agent: requester, from_cache: fromCache });
      efficiency.observe({ type: 'budget_tick', agent: requester, percent_used: budgetCheck.percent_used });
      // Receipt + graph for every skill run (regardless of artifact store)
      receipts.append({ kind: 'skill_run', ref: a.name, agent: requester,
                        meta: { ok: !!r.ok, reason: r.reason ?? null, cached: fromCache } });
      // System observes failures and learns patterns autonomously.
      if (!r.ok) {
        const kind = r.reason === 'SKILL_THREW' ? 'skill_threw' : 'skill_returned_error';
        failures.observe({ kind, reason: r.reason || 'UNKNOWN', skill: a.name,
                           agent: requester, input: a.input, message: r.message });
      }
      const skillNodeId = `skill:${a.name}`;
      graph.addNode({ id: skillNodeId, kind: 'skill', label: a.name });
      graph.link(`agent:${requester}`, skillNodeId, 'called');
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

  // ── SESSION MEMORY GRAPH (PROTOCOL_11) ──────────────────────────────

  graph_stats: {
    description: 'Graph stats: total nodes/edges, counts by kind/type, current session id + hash.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...graph.stats() }),
  },

  graph_link: {
    description: 'Add a typed edge between two nodes. Types: derived_from | called | used_key | minted | supersedes | observed | belongs_to.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' }, to: { type: 'string' },
        type: { type: 'string', enum: ['derived_from','called','used_key','minted','supersedes','observed','belongs_to'] },
      },
      required: ['from','to','type'],
    },
    handler: async (a) => { const r = graph.link(a.from, a.to, a.type); if (r.ok) await persist(); return r; },
  },

  graph_neighbors: {
    description: 'Neighbors of a node along outgoing (default) or incoming edges, optionally filtered by edge type.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        direction: { type: 'string', enum: ['out','in'], default: 'out' },
        type: { type: 'string' },
        limit: { type: 'number', default: 25 },
      },
      required: ['id'],
    },
    handler: async (a) => ({ ok: true, neighbors: graph.neighbors(a.id, a) }),
  },

  graph_path: {
    description: 'BFS shortest path between two nodes (any edge direction). Returns hops + edge sequence.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' }, max_depth: { type: 'number', default: 6 } },
      required: ['from','to'],
    },
    handler: async (a) => graph.path(a.from, a.to, { maxDepth: a.max_depth }),
  },

  graph_search: {
    description: 'Search graph nodes by substring (full JSON match) and/or kind.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, kind: { type: 'string' }, limit: { type: 'number', default: 25 } },
    },
    handler: async (a) => ({ ok: true, nodes: graph.search(a) }),
  },

  // ── KNOWLEDGE TOKENS (PROTOCOL_12) ──────────────────────────────────

  knowledge_mint: {
    description: 'Mint a Knowledge Token fusing ≥2 input refs into a single durable artifact. Returns KT-<hex> id + memory-token reward.',
    inputSchema: {
      type: 'object',
      properties: {
        name:    { type: 'string' },
        summary: { type: 'string', description: 'What the fused understanding MEANS.' },
        domains: { type: 'array', items: { type: 'string' } },
        inputs:  { type: 'array', items: { type: 'object',
          properties: { kind: { type: 'string' }, ref: { type: 'string' } }, required: ['kind','ref'] } },
        minter:  { type: 'string' },
      },
      required: ['name','summary','inputs'],
    },
    handler: async (a) => {
      const r = knowledge.mint(a);
      if (r.ok) {
        // Award memory-token reward
        if (a.minter) tokens.balances.set(a.minter, (tokens.balances.get(a.minter) || 0) + r.mt_reward);
        // Add to graph: token node + edges to each input ref + minted edge from session
        graph.addNode({ id: r.token.id, kind: 'token', label: r.token.name,
                        domains: r.token.domains, hash: r.token.hash });
        graph.link(graph.session.id, r.token.id, 'minted');
        for (const i of r.token.inputs) graph.link(r.token.id, `${i.kind}:${i.ref}`, 'derived_from');
        receipts.append({ kind: 'token_mint', ref: r.token.id, agent: a.minter || 'operator',
                          meta: { name: a.name, input_count: a.inputs.length } });
        await persist();
      }
      return r;
    },
  },

  knowledge_unwrap: {
    description: 'Unwrap a Knowledge Token by id. Returns the summary + lineage + domains. Increments read counter.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => {
      const r = knowledge.unwrap(a.id);
      if (r.ok) {
        receipts.append({ kind: 'token_unwrap', ref: a.id, agent: 'reader', meta: {} });
        await persist();
      }
      return r;
    },
  },

  knowledge_list: {
    description: 'List Knowledge Tokens, optionally filtered by domain or minter.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' }, minter: { type: 'string' }, limit: { type: 'number', default: 25 } },
    },
    handler: async (a) => ({ ok: true, tokens: knowledge.list(a) }),
  },

  knowledge_search: {
    description: 'Search Knowledge Tokens by query; ranked by how often each has been unwrapped.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 25 } } },
    handler: async (a) => ({ ok: true, tokens: knowledge.search(a) }),
  },

  knowledge_stats: {
    description: 'Stats on the Knowledge Token economy: total minted, total unwrapped, MT reward issued, by-domain counts, top 5 unwrapped.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...knowledge.stats() }),
  },

  // ── SKILL SANDBOX (PROTOCOL_13) ─────────────────────────────────────

  sandbox_draft: {
    description: 'Create a draft composed skill (DAG of existing skills). Status starts at "draft".',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string' },
        description: { type: 'string' },
        composition: { type: 'object',
          properties: { id: { type: 'string' }, nodes: { type: 'array' } },
          required: ['id','nodes'] },
        sample_inputs: { type: 'array' },
      },
      required: ['name','composition'],
    },
    handler: async (a) => { const r = sandbox.draft(a); if (r.ok) await persist(); return r; },
  },

  sandbox_test: {
    description: 'Run a draft against an input. Captures ok + output-shape fingerprint.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, input: { type: 'object' } },
      required: ['id'],
    },
    handler: async (a) => {
      const r = sandbox.test(a.id, a.input);
      if (r.ok) {
        receipts.append({ kind: 'sandbox_test', ref: a.id, agent: 'operator',
                          meta: { ok: r.run.ok, ran_nodes: r.run.ran_nodes } });
        await persist();
      }
      return r;
    },
  },

  sandbox_evaluate: {
    description: 'Recompute draft stability (min_runs=3, threshold=0.85) and advance status: draft → testing → stable → promoted.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => sandbox.evaluate(a.id),
  },

  sandbox_promote: {
    description: 'Promote a stable draft into the live SkillRegistry as composed.<name>. Only works on status=stable.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => {
      const r = sandbox.promote(a.id);
      if (r.ok) {
        receipts.append({ kind: 'sandbox_promote', ref: a.id, agent: 'operator', meta: { promoted_as: r.promoted_as } });
        graph.addNode({ id: r.promoted_as, kind: 'skill', label: r.promoted_as });
        const draft = sandbox.drafts.get(a.id);
        efficiency.observe({ type: 'sandbox_promote', composition_size: draft?.composition?.nodes?.length || 1 });
        await persist();
      }
      return r;
    },
  },

  sandbox_list: {
    description: 'List all draft composed skills with their status + run count.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, drafts: sandbox.list() }),
  },

  // ── RECEIPT LEDGER (PROTOCOL_14) ────────────────────────────────────

  receipts_list: {
    description: 'List the most recent Merkle-chained receipts, newest first. Optional filter by kind / agent.',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string' }, agent: { type: 'string' }, limit: { type: 'number', default: 50 } },
    },
    handler: async (a) => ({ ok: true, receipts: receipts.list(a) }),
  },

  receipts_verify: {
    description: 'Recompute the entire receipt chain and report whether it is intact. Returns first-broken seq if tampered.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => receipts.verify(),
  },

  receipts_stats: {
    description: 'Aggregate stats on the receipt chain: total, head_hash, counts by kind/agent.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...receipts.stats() }),
  },

  // ── AI WORKSPACE (PROTOCOL_15) ──────────────────────────────────────

  workspace_focus: {
    description: "Add or refresh a key in the agent's focus slots (LRU, capacity 7). Resets confidence to 1.0; evicts the coldest if full.",
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' }, key: { type: 'string' }, value: {} },
      required: ['key'],
    },
    handler: async (a) => {
      const r = workspace.focus(a.agent_id || defaultRequester(a), a.key, a.value);
      await persist();
      return r;
    },
  },
  workspace_beat: {
    description: "Apply φ-decay to focus slots that haven't been touched in the last minute; evict any below 0.05 confidence.",
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => {
      const r = workspace.beat(a.agent_id || defaultRequester(a));
      await persist();
      return r;
    },
  },
  workspace_scratch: {
    description: "Write a TTL-bounded note to the agent's scratchpad. Default TTL 4h. Notes become promotable after 2 reads.",
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' }, key: { type: 'string' }, value: {}, ttl_ms: { type: 'number' } },
      required: ['key', 'value'],
    },
    handler: async (a) => {
      const r = workspace.scratch(a.agent_id || defaultRequester(a), a.key, a.value, { ttl: a.ttl_ms });
      await persist();
      return r;
    },
  },
  workspace_read_scratch: {
    description: 'Read a scratchpad note; bumps read count, eligible-for-promotion after 2 reads.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' }, key: { type: 'string' } },
      required: ['key'],
    },
    handler: async (a) => {
      const r = workspace.readScratch(a.agent_id || defaultRequester(a), a.key);
      await persist();
      return r;
    },
  },
  workspace_view: {
    description: "View the agent's full workspace: focus slots + scratchpad + stats.",
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => ({ ok: true, ...workspace.view(a.agent_id || defaultRequester(a)) }),
  },
  workspace_sweep: {
    description: 'Sweep expired scratchpad notes for the agent.',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => {
      const r = workspace.sweep(a.agent_id || defaultRequester(a));
      await persist();
      return r;
    },
  },

  // ── PLANS (PROTOCOL_16) ─────────────────────────────────────────────

  plan_create: {
    description: 'Create a multi-step plan. Each step can carry intended_skill / intended_workflow references — making it partly executable.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        why:   { type: 'string' },
        owner: { type: 'string' },
        steps: { type: 'array', items: { type: 'object',
          properties: { title: { type: 'string' }, intended_skill: { type: 'string' },
                        intended_workflow: { type: 'string' }, notes: { type: 'string' } },
          required: ['title'] } },
      },
      required: ['title', 'steps'],
    },
    handler: async (a) => { const r = plans.create(a); if (r.ok) await persist(); return r; },
  },
  plan_advance: {
    description: 'Update a step (status / log). Allowed status: todo, doing, done, blocked, skipped. Plan status rolls up.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, step_id: { type: 'number' },
                    status: { type: 'string' }, log: { type: 'string' } },
      required: ['id', 'step_id'],
    },
    handler: async (a) => { const r = plans.advance(a.id, a.step_id, a); if (r.ok) await persist(); return r; },
  },
  plan_list: {
    description: 'List plans, optionally filtered by owner / status.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, status: { type: 'string' }, limit: { type: 'number', default: 50 } } },
    handler: async (a) => ({ ok: true, plans: plans.list(a) }),
  },
  plan_get: {
    description: 'Get a full plan with every step + log.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => plans.get(a.id),
  },
  plan_next_actions: {
    description: 'Across all active plans, return the next actionable step. Use this as "what should I do now?" across sessions.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, limit: { type: 'number', default: 5 } } },
    handler: async (a) => ({ ok: true, actions: plans.nextActions(a) }),
  },
  plan_pause: {
    description: 'Pause a plan (e.g., at session_close).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => { const r = plans.pause(a.id); if (r.ok) await persist(); return r; },
  },
  plan_resume: {
    description: 'Resume a paused plan.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (a) => { const r = plans.resume(a.id); if (r.ok) await persist(); return r; },
  },

  // ── SESSION LIFECYCLE (PROTOCOL_17) ─────────────────────────────────

  session_open: {
    description: "Open a new AI session. Returns the previous snapshot's summary, focus, active plans, open promises, decisions — for cross-session continuity.",
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, agent_id: { type: 'string' } } },
    handler: async (a) => ctxLog.open({ session_id: a.session_id || graph.session.id, agent: a.agent_id || 'claude' }),
  },
  session_close: {
    description: "Close the current session by writing a context snapshot: summary, focus, active plans, open promises, decisions, recent receipts. Read by session_open next time.",
    inputSchema: {
      type: 'object',
      properties: {
        session_id:    { type: 'string' },
        agent_id:      { type: 'string' },
        summary:       { type: 'string', description: "What we worked on and what's left." },
        focus:         { type: 'array' },
        active_plans:  { type: 'array' },
        open_promises: { type: 'array' },
        decisions:     { type: 'array' },
      },
      required: ['summary'],
    },
    handler: async (a) => {
      const sid = a.session_id || graph.session.id;
      const recent = receipts.list({ limit: 10 });
      const r = ctxLog.snapshot({ ...a, session_id: sid, recent_receipts: recent, agent: a.agent_id || 'claude' });
      if (r.ok) await persist();
      return r;
    },
  },
  context_list: {
    description: 'List recent context snapshots, newest first.',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, limit: { type: 'number', default: 10 } } },
    handler: async (a) => ({ ok: true, snapshots: ctxLog.list({ agent: a.agent_id, limit: a.limit }) }),
  },
  context_stats: {
    description: 'Aggregate stats on the context-snapshot log.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...ctxLog.stats() }),
  },

  // ── MEMORY CONSOLIDATION (PROTOCOL_18) ──────────────────────────────

  consolidate_candidates: {
    description: 'Find cold entry clusters that could collapse into a single semantic summary. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' }, min_cluster: { type: 'number', default: 3 },
                    max_strength: { type: 'number', default: 0.35 },
                    tier: { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] } },
    },
    handler: async (a) => consolidator.candidates({ ownerId: a.agent_id || defaultRequester(a),
                                                    minClusterSize: a.min_cluster,
                                                    maxStrength: a.max_strength, tier: a.tier }),
  },
  consolidate_run: {
    description: 'Collapse a candidate cluster into one consolidated semantic summary; supersedes the sources (which get faster decay).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        prefix:   { type: 'string' },
        summary:  { type: 'string' },
        tier:     { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'], default: 'PRIVATE' },
      },
      required: ['prefix', 'summary'],
    },
    handler: async (a) => {
      const r = consolidator.consolidate({ ownerId: a.agent_id || defaultRequester(a), ...a });
      if (r.ok) await persist();
      return r;
    },
  },

  // ── REINFORCEMENT (PROTOCOL_19) ─────────────────────────────────────

  reinforcement_reinforce: {
    description: "Mark an entry as validated (AI used it successfully). Resets confidence to 1.0 and clears stale flag.",
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async (a) => { const r = reinforcement.reinforce(a.key); await persist(); return r; },
  },
  reinforcement_read: {
    description: 'Record a non-validating read (looked but did not confirm). Bumps read counter.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async (a) => { const r = reinforcement.read(a.key); await persist(); return r; },
  },
  reinforcement_beat: {
    description: 'Apply one φ-decay beat to all reinforcement records older than minQuiet (default 60s). Marks any below 0.05 as stale.',
    inputSchema: { type: 'object', properties: { min_quiet_ms: { type: 'number' } } },
    handler: async (a) => {
      const r = reinforcement.beat({ minQuietMs: a.min_quiet_ms });
      if (r.ok) efficiency.observe({ type: 'reinforcement_beat', marked_stale: r.marked_stale });
      await persist();
      return r;
    },
  },
  reinforcement_list: {
    description: 'List reinforcement records, optionally filtered by stale flag or min confidence.',
    inputSchema: {
      type: 'object',
      properties: { stale: { type: 'boolean' }, min_confidence: { type: 'number' }, limit: { type: 'number', default: 50 } },
    },
    handler: async (a) => ({ ok: true, records: reinforcement.list({ stale: a.stale, minConfidence: a.min_confidence, limit: a.limit }) }),
  },
  reinforcement_stats: {
    description: 'Aggregate stats on reinforcement: total records, stale count, mean confidence, validated_total.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...reinforcement.stats() }),
  },

  // ── EFFICIENCY (PROTOCOL_20): skill cache ───────────────────────────

  cache_view: {
    description: "Skill-cache stats: size, hits, misses, hit_rate, estimated saved_ms. Loom caches deterministic skill results so the AI doesn't re-pay for the same call.",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...cache.view() }),
  },
  cache_clear: {
    description: 'Clear the skill cache (e.g., after a logic change that invalidates prior results).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => { cache.clear(); await persist(); return { ok: true }; },
  },

  // ── EFFICIENCY (PROTOCOL_21): budget tracker ────────────────────────

  budget_set: {
    description: "Set per-agent caps on tool calls and/or estimated tokens. AIs can check budget_view to throttle before burning more.",
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' }, tool_calls: { type: 'number' }, estimated_tokens: { type: 'number' } },
    },
    handler: async (a) => { const r = budget.setCap(a.agent_id || 'claude', a); await persist(); return r; },
  },
  budget_check: {
    description: 'Quick within-budget check; returns percent_used + warning if ≥80% / ≥100%.',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => budget.check(a.agent_id || 'claude'),
  },
  budget_view: {
    description: "Full budget view for an agent: counts, caps, top skills, sessions, started.",
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => budget.view(a.agent_id || 'claude'),
  },
  budget_reset: {
    description: 'Zero out an agent\'s tool_calls + estimated_tokens for a fresh measurement window.',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
    handler: async (a) => { const r = budget.reset(a.agent_id || 'claude'); await persist(); return r; },
  },

  // ── EFFICIENCY: context delta resume ────────────────────────────────

  session_resume_delta: {
    description: 'Open a session and receive ONLY what changed since since_hash. If unknown, returns the full latest snapshot. Saves tokens vs. session_open which always returns the full prior snapshot.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, agent_id: { type: 'string' }, since_hash: { type: 'string' } },
    },
    handler: async (a) => {
      const r = ctxLog.openDelta({ session_id: a.session_id || graph.session.id,
                                    agent: a.agent_id || 'claude',
                                    since_hash: a.since_hash });
      const fullBytes = JSON.stringify(ctxLog.latest({ agent: a.agent_id || 'claude' }) || {}).length;
      const deltaBytes = JSON.stringify(r.delta || {}).length;
      efficiency.observe({ type: 'session_open', agent: a.agent_id || 'claude',
                           returned_bytes: fullBytes, delta_bytes: deltaBytes,
                           no_change: r.no_change });
      return r;
    },
  },

  // ── EFFICIENCY ENGINE (20 models, autonomous receipts) ──────────────

  efficiency_list: {
    description: 'List all 20 efficiency models with description, enabled flag, and fire count. The system runs these autonomously on every observed event.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, models: efficiency.list() }),
  },
  efficiency_stats: {
    description: 'Aggregate efficiency stats: tokens saved, calls avoided, ms saved, bytes saved, top firing models.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...efficiency.stats() }),
  },
  efficiency_report: {
    description: 'Auto-generated markdown efficiency report from observed activity. The system writes this — not you.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => efficiency.report(),
  },
  efficiency_toggle: {
    description: 'Enable or disable an efficiency model by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, on: { type: 'boolean' } },
      required: ['id', 'on'],
    },
    handler: async (a) => { const r = efficiency.toggle(a.id, a.on); await persist(); return r; },
  },

  // ── FAILURE REGISTRY (autonomous: system observes errors, learns patterns) ──

  failures_list: {
    description: 'List failure buckets, optionally filtered to detected-patterns-only or those with open proposals. Newest activity first.',
    inputSchema: {
      type: 'object',
      properties: { pattern_only: { type: 'boolean' }, with_proposals: { type: 'boolean' }, limit: { type: 'number', default: 50 } },
    },
    handler: async (a) => ({ ok: true, buckets: failures.list(a) }),
  },
  failures_get: {
    description: 'Get a failure bucket by signature: full context history + any proposed fix.',
    inputSchema: { type: 'object', properties: { sig: { type: 'string' } }, required: ['sig'] },
    handler: async (a) => failures.get(a.sig),
  },
  failures_stats: {
    description: 'Aggregate stats: total failures, patterns detected, fixes proposed/applied, by_kind breakdown, top recurring.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, ...failures.stats() }),
  },
  failures_apply_fix: {
    description: 'Apply the auto-proposed fix for a failure pattern. For documentation_entry strategy, returns the entry to vault_store.',
    inputSchema: { type: 'object', properties: { sig: { type: 'string' } }, required: ['sig'] },
    handler: async (a) => { const r = failures.applyFix(a.sig); await persist(); return r; },
  },
  failures_dismiss: {
    description: 'Dismiss an open proposal (the pattern is real but not worth fixing).',
    inputSchema: { type: 'object', properties: { sig: { type: 'string' } }, required: ['sig'] },
    handler: async (a) => { const r = failures.dismiss(a.sig); await persist(); return r; },
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
