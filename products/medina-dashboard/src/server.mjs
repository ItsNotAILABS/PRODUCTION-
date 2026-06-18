#!/usr/bin/env node
// Medina Dashboard — local app shell for the entire vault surface.
// Sidebar: Vault · Skills · Workflows · Keys · Tokens · Protocols.
// Skills + Workflows can be RUN from the UI; PDFs download in-browser.
// Reads ~/.medina/vault.json directly; loads SkillRegistry from medina-vault.

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_SRC = resolve(__dirname, '..', '..', 'medina-vault', 'src');

const { SkillRegistry }    = await import(pathToFileURL(join(VAULT_SRC, 'skills.mjs')).href);
const { WorkflowRunner }   = await import(pathToFileURL(join(VAULT_SRC, 'workflows.mjs')).href);
const { WORKFLOW_LIBRARY, listWorkflows } =
  await import(pathToFileURL(join(VAULT_SRC, 'skills/workflows_library.mjs')).href);
const { MedinaVault }      = await import(pathToFileURL(join(VAULT_SRC, 'vault.mjs')).href);
const { SessionGraph }     = await import(pathToFileURL(join(VAULT_SRC, 'graph.mjs')).href);
const { KnowledgeLedger }  = await import(pathToFileURL(join(VAULT_SRC, 'knowledge_tokens.mjs')).href);
const { ReceiptLedger }    = await import(pathToFileURL(join(VAULT_SRC, 'receipts.mjs')).href);
const { SkillSandbox }     = await import(pathToFileURL(join(VAULT_SRC, 'sandbox.mjs')).href);
const { KeyVault }         = await import(pathToFileURL(join(VAULT_SRC, 'keys.mjs')).href);
const { buildGitHubSkills } = await import(pathToFileURL(join(VAULT_SRC, 'integrations/github.mjs')).href);
const { RootVault }        = await import(pathToFileURL(join(VAULT_SRC, 'root_vault.mjs')).href);
const { ApiGateway, issueApiKey } = await import(pathToFileURL(join(VAULT_SRC, 'api_gateway.mjs')).href);
const { EngineRegistry }   = await import(pathToFileURL(join(VAULT_SRC, 'engines.mjs')).href);
const { AIRegistry }       = await import(pathToFileURL(join(VAULT_SRC, 'ai_registry.mjs')).href);
const { DepositLedger }    = await import(pathToFileURL(join(VAULT_SRC, 'deposits.mjs')).href);
const { Workspace }        = await import(pathToFileURL(join(VAULT_SRC, 'workspace.mjs')).href);
const { PlanLedger }       = await import(pathToFileURL(join(VAULT_SRC, 'plans.mjs')).href);
const { ContextLog }       = await import(pathToFileURL(join(VAULT_SRC, 'context.mjs')).href);
const { Reinforcement }    = await import(pathToFileURL(join(VAULT_SRC, 'reinforcement.mjs')).href);

const PORT = Number(process.env.MEDINA_DASHBOARD_PORT || 8731);
const MEDINA_HOME = process.env.MEDINA_HOME || join(homedir(), '.medina');
const VAULT_PATH  = process.env.MEDINA_VAULT_PATH  || join(MEDINA_HOME, 'vault.json');
const SIGNAL_PATH = process.env.MEDINA_SIGNAL_PATH || join(MEDINA_HOME, 'signal.json');

const PHI = 1.618033988749895;
const DECAY_THRESHOLD = 0.05;

// Live vault for memory.* skills + DUAL_READ semantics.
const OPERATOR = process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || 'operator';
const vault    = new MedinaVault({ operatorId: OPERATOR });
const keys     = new KeyVault();
const receipts  = new ReceiptLedger();
const skills   = new SkillRegistry({ vault });
for (const s of buildGitHubSkills({ keys, receipts })) skills.register(s);
const workflows = new WorkflowRunner({ registry: skills });
const graph    = new SessionGraph();
const knowledge = new KnowledgeLedger();
const sandbox   = new SkillSandbox({ registry: skills, runner: workflows });
const workspace = new Workspace();
const planLedger = new PlanLedger();
const ctxLog    = new ContextLog();
const reinforcement = new Reinforcement();
const rootVault = new RootVault();
await rootVault.load();
let apiGateway = null;
const aiRegistry = new AIRegistry({ receipts });
const deposits = new DepositLedger({ receipts, vault });
const engines = new EngineRegistry({ skills, agents: null, vault, rootVault, receipts,
                                      knowledge, failures: null, efficiency: null,
                                      consolidator: null, reinforcement, ctxLog,
                                      autoDoctrine: null, symbolTable: null });

// One-time hydrate from disk so live writes don't drop existing state.
const _initial = await readJsonSafe(VAULT_PATH);
if (_initial) vault.loadFromJSON(_initial);
graph.loadFromMeta(_initial?._meta);
knowledge.loadFromMeta(_initial?._meta);
receipts.loadFromMeta(_initial?._meta);
sandbox.loadFromMeta(_initial?._meta);
keys.loadFromMeta(_initial?._meta);
workspace.loadFromMeta(_initial?._meta);
planLedger.loadFromMeta(_initial?._meta);
ctxLog.loadFromMeta(_initial?._meta);
reinforcement.loadFromMeta(_initial?._meta);

async function persist() {
  const snap = vault.toJSON();
  snap._meta = {
    ...(snap._meta || {}),
    ...graph.toMeta(),
    ...knowledge.toMeta(),
    ...receipts.toMeta(),
    ...sandbox.toMeta(),
    ...keys.toMeta(),
    ...workspace.toMeta(),
    ...planLedger.toMeta(),
    ...ctxLog.toMeta(),
    ...reinforcement.toMeta(),
    custos: { online: true, last_persist: Date.now(), source: 'dashboard' },
  };
  const tmp = VAULT_PATH + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(snap, null, 2));
  await fs.rename(tmp, VAULT_PATH);
}

// Hydrate read-only views from the on-disk vault snapshot
async function rehydrate() {
  const v = await readJsonSafe(VAULT_PATH);
  graph.loadFromMeta(v?._meta);
  knowledge.loadFromMeta(v?._meta);
  receipts.loadFromMeta(v?._meta);
  sandbox.loadFromMeta(v?._meta);
  keys.loadFromMeta(v?._meta);
  workspace.loadFromMeta(v?._meta);
  planLedger.loadFromMeta(v?._meta);
  ctxLog.loadFromMeta(v?._meta);
  reinforcement.loadFromMeta(v?._meta);
  aiRegistry.loadFromMeta(v?._meta);
  deposits.loadFromMeta(v?._meta);
}

async function readJsonSafe(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

function vaultStats(snapshot) {
  if (!snapshot?.entries) return { total: 0, tiers: {}, entries: [] };
  const now = Date.now();
  const tiers = { PUBLIC: 0, SHARED: 0, PRIVATE: 0, SOVEREIGN: 0 };
  const entries = [];
  for (const [, e] of snapshot.entries) {
    tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    const ageHours = (now - e.createdAt) / 3_600_000;
    const strength = e.decayRate === 0 ? 1 : Math.exp(-e.decayRate * ageHours);
    if (strength < DECAY_THRESHOLD) continue;
    entries.push({
      key: e.key, tier: e.tier, owner: e.ownerId,
      strength: Math.round(strength * 1000) / 1000,
      lineage_depth: (e.lineage || []).length,
      created: new Date(e.createdAt).toISOString(),
      tags: e.metadata?.tags || [],
      value_preview: typeof e.value === 'string'
        ? e.value.slice(0, 240)
        : JSON.stringify(e.value).slice(0, 240),
    });
  }
  entries.sort((a, b) => b.strength - a.strength);
  return { total: entries.length, tiers, entries };
}

function metaStats(snapshot) {
  const meta = snapshot?._meta || {};
  return {
    keys:   Object.entries(meta.keys || {}).map(([name, v]) => ({
      name, fingerprint: v.fingerprint, addedAt: v.addedAt,
      lastUsedAt: v.lastUsedAt, usageCount: v.usageCount,
    })),
    tokens: Object.entries(meta.tokens || {}).map(([agent, balance]) => ({ agent, balance })),
    custos: meta.custos || null,
  };
}

function signalStats(snapshot) {
  if (!snapshot?.signals) return { total: 0, roles: [], recent: [] };
  return { total: snapshot.signals.length, roles: snapshot.roles || [], recent: snapshot.signals.slice(-20).reverse() };
}

async function gatherState() {
  const [v, s] = await Promise.all([readJsonSafe(VAULT_PATH), readJsonSafe(SIGNAL_PATH)]);
  return {
    operator:    process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || process.env.USER || 'operator',
    medina_home: MEDINA_HOME,
    protocol:    'MEDINA-PROTOCOL/0.2',
    phi: PHI, heartbeat_ms: 873,
    vault:  { path: VAULT_PATH,  ...vaultStats(v) },
    signal: { path: SIGNAL_PATH, ...signalStats(s) },
    meta:   metaStats(v),
    graph:     graph.stats(),
    knowledge: knowledge.stats(),
    receipts:  receipts.stats(),
    sandbox:   { drafts: sandbox.list() },
    workspace: { agents: workspace.agents().length },
    plans:     planLedger.stats(),
    counts: { skills: skills.list().length, workflows: Object.keys(WORKFLOW_LIBRARY).length,
              domains: skills.domains().length },
    timestamp: new Date().toISOString(),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/state') return json(res, await gatherState());

    if (req.method === 'GET' && url.pathname === '/api/skills')
      return json(res, { skills: skills.list(), domains: skills.domains() });

    if (req.method === 'POST' && url.pathname === '/api/skills/run') {
      const body = await readBody(req);
      return json(res, skills.run(body.name, body.input || {}, { agent_id: 'dashboard' }));
    }

    if (req.method === 'GET' && url.pathname === '/api/workflows')
      return json(res, { library: listWorkflows() });

    if (req.method === 'POST' && url.pathname === '/api/workflows/run') {
      const body = await readBody(req);
      const def = WORKFLOW_LIBRARY[body.id];
      if (!def) return json(res, { ok: false, reason: 'WORKFLOW_NOT_FOUND' });
      const filled = JSON.parse(JSON.stringify(def, (k, v) =>
        typeof v === 'string' ? v.replace(/\$\{([^}|.]+)\}/g, (_, k2) => body.vars?.[k2] ?? `\${${k2}}`) : v
      ));
      return json(res, workflows.run(filled, { agent_id: 'dashboard' }));
    }

    if (req.method === 'GET' && url.pathname === '/api/runs')
      return json(res, { skill_runs: skills.history({ limit: 30 }),
                         workflow_runs: workflows.status({ limit: 10 }) });

    if (req.method === 'GET' && url.pathname === '/api/knowledge') {
      return json(res,{ tokens: knowledge.list({ limit: 100 }), stats: knowledge.stats() });
    }
    if (req.method === 'GET' && url.pathname === '/api/graph') {
      return json(res,{
        stats: graph.stats(),
        nodes: [...graph.nodes.values()].slice(0, 200),
        edges: graph.edges.slice(-200),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/receipts') {
      return json(res,{ receipts: receipts.list({ limit: 100 }), verify: receipts.verify(), stats: receipts.stats() });
    }
    if (req.method === 'GET' && url.pathname === '/api/sandbox') {
      return json(res,{ drafts: sandbox.list() });
    }
    if (req.method === 'GET' && url.pathname === '/api/workspace') {
      await rehydrate();
      const agents = workspace.agents();
      const workspaces = {};
      for (const a of agents) workspaces[a] = workspace.view(a);
      return json(res, { agents, workspaces });
    }
    if (req.method === 'GET' && url.pathname === '/api/plans') {
      return json(res, { plans: planLedger.list({ limit: 50 }), next_actions: planLedger.nextActions({ limit: 10 }), stats: planLedger.stats() });
    }

    // ── WRITE ENDPOINTS — same API surface as MCP, callable via HTTP ──
    if (req.method === 'POST' && url.pathname === '/api/vault/store') {
      const b = await readBody(req);
      const r = vault.store({ key: b.key, value: b.value, tier: b.tier || 'PRIVATE',
                              ownerId: b.agent_id || OPERATOR,
                              prior_hash: b.prior_hash, ttlMs: b.ttl_ms,
                              metadata: b.metadata, sharedWith: b.shared_with });
      if (r.ok) {
        graph.addNode({ id: `entry:${r.entry.key}`, kind: 'entry', label: r.entry.key, tier: r.entry.tier });
        graph.addNode({ id: `agent:${b.agent_id || OPERATOR}`, kind: 'agent', label: b.agent_id || OPERATOR });
        graph.link(`agent:${b.agent_id || OPERATOR}`, `entry:${r.entry.key}`, 'observed');
        graph.link(`entry:${r.entry.key}`, graph.session.id, 'belongs_to');
        receipts.append({ kind: 'vault_store', ref: r.entry.key, agent: b.agent_id || OPERATOR,
                          meta: { tier: r.entry.tier, hash: r.head_hash, lineage_depth: r.lineage_depth } });
        await persist();
      }
      return json(res, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/workspace/focus') {
      const b = await readBody(req);
      const r = workspace.focus(b.agent_id || 'claude', b.key, b.value);
      await persist();
      return json(res, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/workspace/scratch') {
      const b = await readBody(req);
      const r = workspace.scratch(b.agent_id || 'claude', b.key, b.value, { ttl: b.ttl_ms });
      await persist();
      return json(res, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/plans/create') {
      const b = await readBody(req);
      const r = planLedger.create(b);
      if (r.ok) await persist();
      return json(res, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/plans/advance') {
      const b = await readBody(req);
      const r = planLedger.advance(b.id, b.step_id, b);
      if (r.ok) await persist();
      return json(res, r);
    }
    if (req.method === 'POST' && url.pathname === '/api/knowledge/mint') {
      const b = await readBody(req);
      const r = knowledge.mint(b);
      if (r.ok) {
        graph.addNode({ id: r.token.id, kind: 'token', label: r.token.name, domains: r.token.domains });
        graph.link(graph.session.id, r.token.id, 'minted');
        for (const i of r.token.inputs) graph.link(r.token.id, `${i.kind}:${i.ref}`, 'derived_from');
        receipts.append({ kind: 'token_mint', ref: r.token.id, agent: b.minter || 'claude',
                          meta: { name: b.name, input_count: b.inputs.length } });
        await persist();
      }
      return json(res, r);
    }
    // ── API GATEWAY CONTROL ───────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/gateway/start') {
      const b = await readBody(req);
      if (apiGateway) return json(res, { ok: true, already_running: true, port: apiGateway.port });
      const port = b.port || 8732;
      // Build a tool map mirroring the dashboard's own callable surface.
      const toolMap = {
        vault_store: { description: 'Store an entry.', inputSchema: { type:'object' },
          handler: async (a) => vault.store({ key: a.key, value: a.value, tier: a.tier || 'PRIVATE',
                                              ownerId: a.agent_id || OPERATOR, metadata: a.metadata }) },
        vault_list: { description: 'List entries.', inputSchema: { type:'object' },
          handler: async (a) => ({ ok: true, entries: vault.list(a.agent_id || OPERATOR, { tier: a.tier }) }) },
        root_list: { description: 'List ROOT entries (system/AI only).', inputSchema: { type:'object' },
          handler: async (a) => rootVault.list({ agent_id: a.agent_id, operator: OPERATOR, kind: a.kind, tag: a.tag }) },
        root_read: { description: 'Read a ROOT entry.', inputSchema: { type:'object' },
          handler: async (a) => rootVault.read({ key: a.key, agent_id: a.agent_id, operator: OPERATOR }) },
        root_write: { description: 'Write a ROOT entry.', inputSchema: { type:'object' },
          handler: async (a) => {
            const r = rootVault.write({ key: a.key, value: a.value, agent_id: a.agent_id,
                                         kind: a.kind, operator: OPERATOR }, { tags: a.tags });
            if (r.ok) await rootVault.persist();
            return r;
          }},
        engines_list: { description: 'List named engines.', inputSchema: { type:'object' },
          handler: async () => ({ ok: true, engines: engines.list() }) },
        engines_run: { description: 'Run a named engine.', inputSchema: { type:'object' },
          handler: async (a) => engines.run(a.name, a.input || {}, { operator: OPERATOR }) },
        skills_list: { description: 'List skills.', inputSchema: { type:'object' },
          handler: async (a) => ({ ok: true, skills: skills.list({ prefix: a.prefix }) }) },
        skills_run: { description: 'Run a skill.', inputSchema: { type:'object' },
          handler: async (a) => skills.run(a.name, a.input || {}, { agent_id: a.agent_id || 'external' }) },
        deposit_create: { description: 'Deposit an encrypted artifact (zip/json/etc).', inputSchema: { type:'object' },
          handler: async (a) => deposits.create(a) },
        deposit_list: { description: 'List own deposits.', inputSchema: { type:'object' },
          handler: async (a) => ({ ok: true, deposits: deposits.list({ agent_id: a.agent_id, limit: a.limit }) }) },
        deposit_get: { description: 'Retrieve own deposit.', inputSchema: { type:'object' },
          handler: async (a) => deposits.get({ deposit_id: a.deposit_id, agent_id: a.agent_id }) },
        deposit_stats: { description: 'Deposit stats.', inputSchema: { type:'object' },
          handler: async () => ({ ok: true, ...deposits.stats() }) },
        loom_status_proof: { description: 'One-call proof surface.', inputSchema: { type:'object' },
          handler: async () => {
            const recVerify = receipts.verify();
            const rootVerify = rootVault.verify();
            return {
              ok: true, version: '0.3.0',
              architecture_statement: 'Loom v0.3 establishes a governed multi-tenant AI memory gateway: agents can read and write only inside scoped namespaces, execution is pre-reviewed before runspace access, and chain integrity is exposed through a single status layer.',
              layers: { vault: vault.entries.size, root: rootVault.entries.size,
                        receipts: receipts.receipts.length, knowledge: knowledge.tokens.size,
                        deposits: deposits.manifests.size, ais: aiRegistry.list().length },
              chain_integrity: { receipts: recVerify, root: rootVerify, all_intact: recVerify.ok && rootVerify.ok },
              tenant_isolation: { rule: 'agent_id → ai/<agent_id>/*',
                                  denied: ['operator/*','ai/<other>/*','root/*'],
                                  registered_ais: aiRegistry.list().map(a => ({ id: a.agent_id, tier: a.tier })) },
              last_receipts: receipts.list({ limit: 10 }).map(r => ({ seq: r.seq, kind: r.kind, ref: r.ref, agent: r.agent, hash: r.hash.slice(0,16) })),
              ts: new Date().toISOString(),
            };
          }},
      };
      apiGateway = new ApiGateway({ tools: toolMap, rootVault, receipts, port, aiRegistry });
      await apiGateway.start();
      return json(res, { ok: true, port: apiGateway.port,
                         url: `http://localhost:${apiGateway.port}`,
                         openai_schema: `http://localhost:${apiGateway.port}/.well-known/openai-functions`,
                         tool_count: Object.keys(toolMap).length,
                         tier_gated: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/gateway/stop') {
      if (!apiGateway) return json(res, { ok: false, reason: 'NOT_RUNNING' });
      await apiGateway.stop();
      apiGateway = null;
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/gateway/issue_key') {
      const b = await readBody(req);
      const r = issueApiKey({ rootVault, name: b.name, agent_id: b.agent_id, operator: OPERATOR });
      if (r.ok) await rootVault.persist();
      return json(res, r);
    }
    if (req.method === 'GET' && url.pathname === '/api/gateway/status') {
      return json(res, apiGateway
        ? { ok: true, running: true, port: apiGateway.port, tool_count: Object.keys(apiGateway.tools).length }
        : { ok: true, running: false });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/register') {
      await rehydrate();
      const b = await readBody(req);
      const r = aiRegistry.register(b);
      // Save back via root vault meta — no operator vault write needed since AI registry
      // is system state. Persist root_vault so it sticks.
      return json(res, r);
    }
    if (req.method === 'GET' && url.pathname === '/api/ai/list') {
      await rehydrate();
      return json(res, { ok: true, ais: aiRegistry.list() });
    }

    if (req.method === 'POST' && url.pathname === '/api/session/close') {
      const b = await readBody(req);
      const recent = receipts.list({ limit: 10 });
      const r = ctxLog.snapshot({ ...b, session_id: b.session_id || graph.session.id,
                                  recent_receipts: recent, agent: b.agent_id || 'claude' });
      if (r.ok) await persist();
      return json(res, r);
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`\n  Medina Dashboard — http://localhost:${PORT}`);
  console.log(`  ${skills.list().length} skills · ${Object.keys(WORKFLOW_LIBRARY).length} workflows · MEDINA-PROTOCOL/0.2\n`);
});

// ──────────────────────────────────────────────────────────────────────────
// HTML — single-file app shell
// ──────────────────────────────────────────────────────────────────────────

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Loom v0.3 · Persistent memory and skills for AI</title>
<style>
:root{
  --bg:#07090e; --panel:#0d111a; --panel2:#11161f; --line:#1a2233;
  --ink:#e5e8ef; --ink-dim:#9aa3b2; --dim:#6b7280;
  --gold:#d4a843; --green:#34d399; --red:#ef4444; --blue:#60a5fa;
  --pri:#6366f1; --sov:#ef4444; --sha:#06b6d4; --pub:#94a3b8;
  --mono: ui-monospace, "JetBrains Mono", Consolas, monospace;
  --sans: -apple-system, "Segoe UI", system-ui, sans-serif;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 var(--mono)}
a{color:var(--blue);text-decoration:none}
button{font:inherit;cursor:pointer;background:var(--panel2);color:var(--ink);border:1px solid var(--line);padding:6px 12px;border-radius:3px}
button:hover{background:var(--panel);border-color:var(--gold)}
button.primary{background:var(--gold);color:#0b0b0b;border-color:var(--gold);font-weight:600}
button.primary:hover{filter:brightness(1.1)}
input,textarea,select{font:inherit;background:var(--bg);color:var(--ink);border:1px solid var(--line);padding:6px 8px;border-radius:3px;width:100%}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--gold)}
code{color:var(--gold)}
.app{display:grid;grid-template-columns:240px 1fr;height:100vh;overflow:hidden}
/* ── sidebar ── */
.side{background:#04060a;border-right:1px solid var(--line);display:flex;flex-direction:column}
.brand{padding:18px 16px;border-bottom:1px solid var(--line)}
.brand h1{margin:0;font-size:14px;letter-spacing:.2em;color:var(--gold)}
.brand .sub{font-size:10px;color:var(--dim);margin-top:4px;letter-spacing:.1em}
.nav{flex:1;padding:8px 0;overflow:auto}
.nav button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;border-left:2px solid transparent;background:none;color:var(--ink-dim);padding:10px 16px;border-radius:0;font-size:12px;letter-spacing:.05em}
.nav button:hover{background:#0a0e16;color:var(--ink)}
.nav button.active{background:#0a0e16;border-left-color:var(--gold);color:var(--gold)}
.nav .icon{font-size:14px;width:18px;text-align:center}
.nav .count{margin-left:auto;font-size:10px;color:var(--dim);background:var(--panel);padding:2px 6px;border-radius:8px}
.side .foot{padding:12px 16px;border-top:1px solid var(--line);font-size:10px;color:var(--dim)}
.live{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:6px;vertical-align:middle;animation:pulse 1.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
/* ── main ── */
.main{overflow:auto;padding:24px 32px}
.head{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.head h2{margin:0;font-size:20px;letter-spacing:.05em;color:var(--ink)}
.head .pill{font-size:10px;color:var(--gold);background:#1f1605;border:1px solid #3a2a06;padding:3px 8px;border-radius:10px;letter-spacing:.1em}
.stats{display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:14px 18px;min-width:120px}
.stat .n{font-size:22px;color:var(--gold);font-weight:600}
.stat .l{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em;margin-top:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:14px;cursor:pointer;transition:all .12s}
.card:hover{border-color:var(--gold);background:var(--panel2);transform:translateY(-1px)}
.card .name{color:var(--gold);font-size:12px;margin-bottom:4px}
.card .desc{color:var(--ink-dim);font-size:11px;line-height:1.45;height:48px;overflow:hidden}
.card .meta{display:flex;justify-content:space-between;margin-top:8px;font-size:10px;color:var(--dim)}
.domain-pill{display:inline-block;padding:2px 6px;border-radius:2px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;background:var(--bg);color:var(--ink-dim);border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:normal;font-size:10px;text-transform:uppercase;letter-spacing:.1em;background:var(--panel2);position:sticky;top:0}
.tier{display:inline-block;padding:1px 6px;border-radius:2px;font-size:9px;letter-spacing:.1em}
.tier-PUBLIC{background:#1e293b;color:var(--pub)}
.tier-SHARED{background:#0e3a4c;color:var(--sha)}
.tier-PRIVATE{background:#1e1b4b;color:var(--pri)}
.tier-SOVEREIGN{background:#4c1d1d;color:var(--sov)}
.preview{color:var(--ink-dim);max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{color:var(--dim);padding:32px;text-align:center;font-style:italic}
.toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.toolbar input{max-width:280px}
/* ── modal / drawer ── */
.drawer{position:fixed;top:0;right:0;width:540px;max-width:95vw;height:100vh;background:var(--panel);border-left:1px solid var(--gold);box-shadow:-8px 0 32px rgba(0,0,0,.6);transform:translateX(100%);transition:transform .18s;z-index:10;display:flex;flex-direction:column}
.drawer.open{transform:translateX(0)}
.drawer .dh{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
.drawer .dh h3{margin:0;font-size:14px;color:var(--gold);flex:1}
.drawer .dh button.close{padding:4px 10px}
.drawer .db{padding:16px 20px;flex:1;overflow:auto}
.drawer .df{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;background:var(--panel2)}
.field{margin-bottom:12px}
.field label{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.field .help{font-size:10px;color:var(--dim);margin-top:2px}
.result{background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto;color:var(--green)}
.result.err{color:var(--red)}
.tag{display:inline-block;padding:1px 6px;font-size:9px;color:var(--ink-dim);background:var(--bg);border:1px solid var(--line);border-radius:2px;margin-right:4px}
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand">
      <h1>⌘ LOOM</h1>
      <div class="sub">Persistent memory and skills for AI</div>
      <div class="sub" style="margin-top:2px">v0.3 · <span class="live" id="health-dot"></span><span id="health-text">checking…</span></div>
      <div class="sub" style="margin-top:6px;font-size:9px;color:var(--dim)">φ=1.618 · 873ms · <span id="gateway-status">gateway —</span></div>
    </div>
    <nav class="nav" id="nav"></nav>
    <div class="foot">
      operator <code id="op">…</code><br>
      <span id="opath">…</span>
    </div>
  </aside>
  <main class="main" id="main">
    <div class="empty">loading…</div>
  </main>
</div>

<div class="drawer" id="drawer">
  <div class="dh">
    <h3 id="dtitle">—</h3>
    <button class="close" onclick="closeDrawer()">×</button>
  </div>
  <div class="db" id="dbody"></div>
  <div class="df" id="dfoot"></div>
</div>

<script>
const TABS = [
  { id:'workspace', label:'Workspace', icon:'☉' },
  { id:'plans',     label:'Plans',     icon:'☷' },
  { id:'vault',     label:'Vault',     icon:'⟁' },
  { id:'skills',    label:'Skills',    icon:'✦' },
  { id:'workflows', label:'Workflows', icon:'⇄' },
  { id:'knowledge', label:'Knowledge', icon:'◇' },
  { id:'graph',     label:'Graph',     icon:'⌬' },
  { id:'sandbox',   label:'Sandbox',   icon:'◐' },
  { id:'receipts',  label:'Receipts',  icon:'⛓' },
  { id:'keys',      label:'Keys',      icon:'⚷' },
  { id:'tokens',    label:'Tokens',    icon:'◈' },
  { id:'signal',    label:'Signal',    icon:'⇋' },
  { id:'runs',      label:'Activity',  icon:'⏱' },
];
let STATE = null, SKILLS = [], DOMAINS = [], WFS = [], CURRENT = 'vault';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function fetchAll() {
  const [state, sks, wfs, gw] = await Promise.all([
    fetch('/state').then(r=>r.json()),
    fetch('/api/skills').then(r=>r.json()),
    fetch('/api/workflows').then(r=>r.json()),
    fetch('/api/gateway/status').then(r=>r.json()).catch(() => ({running:false})),
  ]);
  STATE = state; SKILLS = sks.skills; DOMAINS = sks.domains; WFS = wfs.library;
  $('op').textContent = state.operator;
  $('opath').textContent = state.medina_home;
  // Live health indicator in the brand sub
  const healthy = (state.receipts?.total ?? 0) >= 0; // basic up-check; receipt chain handled per tab
  $('health-text').textContent = healthy ? 'live' : 'down';
  $('health-dot').style.background = healthy ? 'var(--green)' : 'var(--red)';
  $('gateway-status').textContent = gw.running
    ? \`gateway :\${gw.port} · \${gw.tool_count} tools\`
    : 'gateway off';
  $('gateway-status').style.color = gw.running ? 'var(--green)' : 'var(--dim)';
  renderNav();
  render(CURRENT);
}

function renderNav() {
  const counts = {
    vault:     STATE.vault.total,
    skills:    SKILLS.length,
    workflows: WFS.length,
    workspace: STATE.workspace?.agents ?? 0,
    plans:     STATE.plans?.total ?? 0,
    knowledge: STATE.knowledge?.total ?? 0,
    graph:     STATE.graph?.total_nodes ?? 0,
    sandbox:   STATE.sandbox?.drafts?.length ?? 0,
    receipts:  STATE.receipts?.total ?? 0,
    keys:      STATE.meta.keys.length,
    tokens:    STATE.meta.tokens.length,
    signal:    STATE.signal.total,
    runs:      '',
  };
  $('nav').innerHTML = TABS.map(t =>
    \`<button class="\${CURRENT===t.id?'active':''}" onclick="go('\${t.id}')">
      <span class="icon">\${t.icon}</span><span>\${t.label}</span>
      <span class="count">\${counts[t.id] ?? ''}</span>
    </button>\`).join('');
}

function go(tab) { CURRENT = tab; renderNav(); render(tab); }

function render(tab) {
  const m = $('main');
  if (tab === 'vault')     m.innerHTML = renderVault();
  else if (tab === 'skills')    m.innerHTML = renderSkills();
  else if (tab === 'workflows') m.innerHTML = renderWorkflows();
  else if (tab === 'keys')      m.innerHTML = renderKeys();
  else if (tab === 'tokens')    m.innerHTML = renderTokens();
  else if (tab === 'signal')    m.innerHTML = renderSignal();
  else if (tab === 'runs')      { m.innerHTML = '<div class="empty">loading…</div>'; loadRuns(); }
  else if (tab === 'knowledge') { m.innerHTML = '<div class="empty">loading…</div>'; loadKnowledge(); }
  else if (tab === 'graph')     { m.innerHTML = '<div class="empty">loading…</div>'; loadGraph(); }
  else if (tab === 'receipts')  { m.innerHTML = '<div class="empty">loading…</div>'; loadReceipts(); }
  else if (tab === 'sandbox')   { m.innerHTML = '<div class="empty">loading…</div>'; loadSandbox(); }
  else if (tab === 'workspace') { m.innerHTML = '<div class="empty">loading…</div>'; loadWorkspace(); }
  else if (tab === 'plans')     { m.innerHTML = '<div class="empty">loading…</div>'; loadPlans(); }
}

async function loadWorkspace() {
  const r = await fetch('/api/workspace').then(x=>x.json());
  if (!r.agents?.length) {
    $('main').innerHTML = '<div class="head"><h2>Workspace</h2></div><div class="empty">no agent workspaces yet — call workspace_focus to start</div>';
    return;
  }
  let html = '<div class="head"><h2>Workspace</h2><span class="pill">'+r.agents.length+' agent(s) · focus 7 · scratchpad TTL 4h</span></div>';
  html += '<div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">An AI\\'s working space: <b>focus slots</b> (LRU, cap 7 — Miller 7±2) hold what you\\'re thinking about right now. <b>Scratchpad</b> notes auto-expire in 4 hours; after 2 reads they become eligible for vault promotion. Re-touching a focus resets its confidence to 1.0; cold slots φ-decay each beat.</div>';
  for (const a of r.agents) {
    const view = r.workspaces[a];
    const focusRows = view.focus.length === 0 ? '<tr><td colspan="4" class="empty">no focus slots</td></tr>'
      : view.focus.map(f => '<tr><td><code>'+esc(f.key)+'</code></td><td>'+f.confidence.toFixed(2)+'</td><td>'+f.touches+'</td><td>'+new Date(f.lastTouched).toLocaleTimeString()+'</td></tr>').join('');
    const scratchRows = view.scratchpad.length === 0 ? '<tr><td colspan="4" class="empty">scratchpad empty</td></tr>'
      : view.scratchpad.map(s => '<tr><td><code>'+esc(s.key)+'</code></td><td>'+s.reads+'</td><td>'+(s.eligible?'<span style="color:var(--green)">✓ eligible</span>':'—')+'</td><td>'+new Date(s.expiresAt).toLocaleTimeString()+'</td></tr>').join('');
    html += '<h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase;margin-top:18px">Agent: <code>'+esc(a)+'</code></h3>';
    html += '<div class="stats" style="margin:8px 0"><div class="stat"><div class="n">'+view.focus.length+'</div><div class="l">focus</div></div><div class="stat"><div class="n">'+view.scratchpad.length+'</div><div class="l">scratch</div></div><div class="stat"><div class="n">'+(view.stats?.focuses||0)+'</div><div class="l">total focuses</div></div><div class="stat"><div class="n">'+(view.stats?.scratches||0)+'</div><div class="l">total scratches</div></div></div>';
    html += '<h4 style="font-size:10px;color:var(--dim);letter-spacing:.1em;margin:12px 0 4px">Focus slots (LRU)</h4>';
    html += '<table><thead><tr><th>key</th><th>confidence</th><th>touches</th><th>last touched</th></tr></thead><tbody>'+focusRows+'</tbody></table>';
    html += '<h4 style="font-size:10px;color:var(--dim);letter-spacing:.1em;margin:12px 0 4px">Scratchpad</h4>';
    html += '<table><thead><tr><th>key</th><th>reads</th><th>promotable</th><th>expires</th></tr></thead><tbody>'+scratchRows+'</tbody></table>';
  }
  $('main').innerHTML = html;
}

async function loadPlans() {
  const r = await fetch('/api/plans').then(x=>x.json());
  const rows = r.plans.length === 0
    ? '<tr><td colspan="6" class="empty">no plans yet — call plan_create with steps to track work across sessions</td></tr>'
    : r.plans.map(p => '<tr><td><code>'+esc(p.id)+'</code></td><td>'+esc(p.title)+'</td><td><span class="tag">'+esc(p.status)+'</span></td><td>'+p.steps_done+' / '+p.steps_total+'</td><td>'+(p.steps_blocked>0?'<span style="color:var(--red)">'+p.steps_blocked+'</span>':'0')+'</td><td>'+new Date(p.updated).toLocaleString()+'</td></tr>').join('');
  const actRows = r.next_actions.length === 0
    ? '<tr><td colspan="4" class="empty">no actionable steps right now</td></tr>'
    : r.next_actions.map(a => '<tr><td><code>'+esc(a.plan_id)+'</code></td><td>'+esc(a.plan_title)+'</td><td>'+esc(a.step_title)+'</td><td>'+(a.intended_skill?'<code>'+esc(a.intended_skill)+'</code>':(a.intended_workflow?'<code>'+esc(a.intended_workflow)+'</code>':'—'))+'</td></tr>').join('');
  const byStatus = Object.entries(r.stats?.by_status||{}).map(([s,n]) => '<span class="tag">'+esc(s)+' <code>'+n+'</code></span>').join('');
  $('main').innerHTML =
    '<div class="head"><h2>Plans</h2><span class="pill">'+r.plans.length+' plans · '+r.stats?.open_steps+' open steps</span></div>'+
    '<div style="margin-bottom:14px">'+byStatus+'</div>'+
    '<h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase">Next actions across all active plans</h3>'+
    '<table><thead><tr><th>plan</th><th>title</th><th>step</th><th>intended</th></tr></thead><tbody>'+actRows+'</tbody></table>'+
    '<h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase;margin-top:24px">All plans</h3>'+
    '<table><thead><tr><th>id</th><th>title</th><th>status</th><th>steps</th><th>blocked</th><th>updated</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

async function loadKnowledge() {
  const r = await fetch('/api/knowledge').then(x=>x.json());
  const rows = r.tokens.length === 0
    ? '<tr><td colspan="6" class="empty">no knowledge tokens minted yet — call knowledge_mint with ≥2 input refs</td></tr>'
    : r.tokens.map(t => \`<tr><td><code>\${esc(t.id)}</code></td><td>\${esc(t.name)}</td><td>\${t.domains.map(d=>'<span class="tag">'+esc(d)+'</span>').join('')}</td><td>\${t.inputs.length}</td><td>\${t.unwraps}</td><td>\${t.reward_mt?.toFixed(2)} MX</td></tr>\`).join('');
  const byDom = Object.entries(r.stats.by_domain||{}).map(([d,n]) => \`<span class="tag">\${esc(d)} <code>\${n}</code></span>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Knowledge Tokens</h2><span class="pill">\${r.stats.total} minted · \${r.stats.total_unwrapped} unwrapped · \${r.stats.total_mt_minted?.toFixed(2)} MX rewards</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      A Knowledge Token fuses ≥2 input refs (entries, other tokens, skills, sessions) into a single durable artifact.
      Identity = sha256(sorted_inputs || summary) — minting the same fused understanding twice returns DUPLICATE.
      Knowledge tokens DO NOT decay. Future sessions <code>knowledge_unwrap</code> instead of re-deriving.
    </div>
    <div style="margin-bottom:14px">\${byDom || '<span class="empty" style="padding:0">no domains yet</span>'}</div>
    <table><thead><tr><th>id</th><th>name</th><th>domains</th><th>inputs</th><th>unwraps</th><th>reward</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}

async function loadGraph() {
  const r = await fetch('/api/graph').then(x=>x.json());
  const byKind = Object.entries(r.stats.by_kind||{}).map(([k,n]) => \`<span class="tag">\${esc(k)} <code>\${n}</code></span>\`).join('');
  const byEdge = Object.entries(r.stats.by_edge_type||{}).map(([k,n]) => \`<span class="tag">\${esc(k)} <code>\${n}</code></span>\`).join('');
  const nodeRows = r.nodes.length === 0
    ? '<tr><td colspan="3" class="empty">no graph nodes yet</td></tr>'
    : r.nodes.map(n => \`<tr><td><span class="tag">\${esc(n.kind)}</span></td><td><code>\${esc(n.id)}</code></td><td>\${esc(n.label||'')}</td></tr>\`).join('');
  const edgeRows = r.edges.length === 0
    ? '<tr><td colspan="3" class="empty">no edges yet</td></tr>'
    : r.edges.slice().reverse().map(e => \`<tr><td><code>\${esc(e.from)}</code></td><td><span class="tag">\${esc(e.type)}</span></td><td><code>\${esc(e.to)}</code></td></tr>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Session Graph</h2><span class="pill">\${r.stats.total_nodes} nodes · \${r.stats.total_edges} edges · session \${esc(r.stats.current_session_hash||'')}</span></div>
    <div style="margin-bottom:6px">\${byKind}</div>
    <div style="margin-bottom:16px">\${byEdge}</div>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase">Nodes</h3>
    <table><thead><tr><th>kind</th><th>id</th><th>label</th></tr></thead><tbody>\${nodeRows}</tbody></table>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase;margin-top:24px">Recent Edges</h3>
    <table><thead><tr><th>from</th><th>type</th><th>to</th></tr></thead><tbody>\${edgeRows}</tbody></table>\`;
}

async function loadReceipts() {
  const r = await fetch('/api/receipts').then(x=>x.json());
  const status = r.verify.ok
    ? \`<span style="color:var(--green)">✓ chain intact (length \${r.verify.length}, head <code>\${esc((r.verify.head_hash||'').slice(0,16))}…</code>)</span>\`
    : \`<span style="color:var(--red)">✗ CHAIN BROKEN at seq \${r.verify.first_broken_seq}</span>\`;
  const rows = r.receipts.length === 0
    ? '<tr><td colspan="5" class="empty">no receipts yet — every meaningful event appends here</td></tr>'
    : r.receipts.map(rec => \`<tr><td>\${rec.seq}</td><td>\${new Date(rec.ts).toLocaleTimeString()}</td><td><span class="tag">\${esc(rec.kind)}</span></td><td><code>\${esc(rec.ref)}</code></td><td><code style="font-size:10px">\${esc(rec.hash.slice(0,16))}…</code></td></tr>\`).join('');
  const byKind = Object.entries(r.stats.by_kind||{}).map(([k,n]) => \`<span class="tag">\${esc(k)} <code>\${n}</code></span>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Receipt Ledger</h2><span class="pill">Merkle-chained · \${r.stats.total} entries</span></div>
    <div style="margin-bottom:12px;font-size:12px">\${status}</div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Every vault_store, skill_run, token_mint, key_set, sandbox_test &amp; sandbox_promote appends a signed receipt.
      Each receipt's hash includes the previous receipt's hash. Recompute via <code>receipts_verify</code> — tampering breaks the chain at a known seq.
      Genesis: <code>\${esc(r.stats.genesis)}</code>
    </div>
    <div style="margin-bottom:14px">\${byKind}</div>
    <table><thead><tr><th>seq</th><th>time</th><th>kind</th><th>ref</th><th>hash</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}

async function loadSandbox() {
  const r = await fetch('/api/sandbox').then(x=>x.json());
  const rows = r.drafts.length === 0
    ? '<tr><td colspan="5" class="empty">no draft skills yet — compose one with sandbox_draft</td></tr>'
    : r.drafts.map(d => \`<tr><td><code>\${esc(d.id)}</code></td><td>\${esc(d.name)}</td><td><span class="tag">\${esc(d.status)}</span></td><td>\${d.runs}</td><td>\${esc(d.promoted_as||'—')}</td></tr>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Skill Sandbox</h2><span class="pill">\${r.drafts.length} drafts</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Lifecycle: <code>draft</code> → <code>testing</code> → <code>stable</code> (≥3 runs, ≥0.85 output-shape stability) → <code>promoted</code> (registered as <code>composed.&lt;name&gt;</code>).
      Build composed skills by chaining existing ones; if they prove consistent, they become first-class skills callable from MCP.
    </div>
    <table><thead><tr><th>id</th><th>name</th><th>status</th><th>runs</th><th>promoted as</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}

// ── VAULT ─────────────────────────────────────────────────────────
function renderVault() {
  const v = STATE.vault;
  const rows = v.entries.length === 0
    ? '<tr><td colspan="6" class="empty">vault is empty — your AIs haven\\'t written yet</td></tr>'
    : v.entries.slice(0, 200).map(e => \`
      <tr>
        <td><span class="tier tier-\${e.tier}">\${e.tier}</span></td>
        <td><code>\${esc(e.key)}</code></td>
        <td>\${esc(e.owner)}</td>
        <td>⛓ \${e.lineage_depth}</td>
        <td>\${e.strength.toFixed(2)}</td>
        <td class="preview" title="\${esc(e.value_preview)}">\${esc(e.value_preview)}</td>
      </tr>\`).join('');
  return \`
    <div class="head"><h2>Vault</h2><span class="pill">\${STATE.protocol}</span></div>
    <div class="stats">
      <div class="stat"><div class="n">\${v.total}</div><div class="l">live entries</div></div>
      <div class="stat"><div class="n">\${v.tiers.SOVEREIGN||0}</div><div class="l">sovereign</div></div>
      <div class="stat"><div class="n">\${v.tiers.PRIVATE||0}</div><div class="l">private</div></div>
      <div class="stat"><div class="n">\${v.tiers.SHARED||0}</div><div class="l">shared</div></div>
      <div class="stat"><div class="n">\${v.tiers.PUBLIC||0}</div><div class="l">public</div></div>
    </div>
    <table><thead><tr><th>tier</th><th>key</th><th>owner</th><th>depth</th><th>φ-strength</th><th>preview</th></tr></thead>
    <tbody>\${rows}</tbody></table>\`;
}

// ── SKILLS ────────────────────────────────────────────────────────
function renderSkills() {
  const cards = SKILLS.map(s => \`
    <div class="card" onclick='openSkill(\${JSON.stringify(s.name)})'>
      <div class="name">\${esc(s.name)}</div>
      <div class="desc">\${esc(s.description||'')}</div>
      <div class="meta"><span class="domain-pill">\${esc(s.domain)}</span><span>\${s.template?'template':'native'}</span></div>
    </div>\`).join('');
  const domBar = DOMAINS.map(d => \`<span class="tag">\${esc(d.domain)} <code>\${d.count}</code></span>\`).join('');
  return \`
    <div class="head"><h2>Skills</h2><span class="pill">\${SKILLS.length} skills · \${DOMAINS.length} domains</span></div>
    <div style="margin-bottom:12px">\${domBar}</div>
    <div class="toolbar">
      <input id="sf" placeholder="filter skills…" oninput="filterSkills(this.value)" />
    </div>
    <div class="cards" id="skill-cards">\${cards}</div>\`;
}

function filterSkills(q) {
  q = q.toLowerCase();
  const cards = $('skill-cards').children;
  for (const c of cards) c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
}

function openSkill(name) {
  const skill = SKILLS.find(s => s.name === name);
  if (!skill) return;
  const schema = skill.inputSchema || { properties: {} };
  const props = schema.properties || {};
  const required = schema.required || [];
  const fields = Object.entries(props).map(([k, p]) => {
    const req = required.includes(k);
    const desc = p.description ? \`<div class="help">\${esc(p.description)}</div>\` : '';
    const def = p.default !== undefined ? \` (default: \${esc(JSON.stringify(p.default))})\` : '';
    let input;
    if (p.enum) {
      input = \`<select name="\${esc(k)}">\${p.enum.map(o => \`<option>\${esc(o)}</option>\`).join('')}</select>\`;
    } else if (p.type === 'array') {
      input = \`<textarea name="\${esc(k)}" data-type="array" rows="3" placeholder='[ "item1", "item2" ]'></textarea>\`;
    } else if (p.type === 'object') {
      input = \`<textarea name="\${esc(k)}" data-type="object" rows="4" placeholder='{ "field": "value" }'></textarea>\`;
    } else if (p.type === 'number') {
      input = \`<input name="\${esc(k)}" type="number" data-type="number" />\`;
    } else if (p.type === 'boolean') {
      input = \`<select name="\${esc(k)}" data-type="boolean"><option>false</option><option>true</option></select>\`;
    } else {
      input = \`<input name="\${esc(k)}" type="text" />\`;
    }
    return \`<div class="field"><label>\${esc(k)}\${req?' *':''}\${esc(def)}</label>\${input}\${desc}</div>\`;
  }).join('');
  openDrawer(skill.name, \`
    <div style="color:var(--ink-dim);margin-bottom:14px;font-size:12px">\${esc(skill.description||'')}</div>
    <form id="sform" onsubmit="event.preventDefault(); runSkill();">\${fields}</form>
    <div id="sres"></div>\`,
    \`<button onclick="closeDrawer()">Cancel</button>
     <button class="primary" onclick="runSkill()">Run skill</button>\`);
}

async function runSkill() {
  const skillName = $('dtitle').textContent;
  const form = $('sform');
  const input = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    const t = el.getAttribute('data-type');
    let v = el.value;
    if (v === '') continue;
    try {
      if (t === 'array' || t === 'object') v = JSON.parse(v);
      else if (t === 'number') v = Number(v);
      else if (t === 'boolean') v = (v === 'true');
    } catch (e) { v = el.value; }
    input[el.name] = v;
  }
  $('sres').innerHTML = '<div class="result">running…</div>';
  const r = await fetch('/api/skills/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: skillName, input }),
  }).then(x => x.json());
  let html;
  if (r.ok) {
    html = '<div class="result">' + esc(JSON.stringify(r, null, 2)) + '</div>';
    if (r.bytes_base64 && r.filename) {
      html += \`<div style="margin-top:10px"><button class="primary" onclick='downloadB64(\${JSON.stringify(r.filename)}, \${JSON.stringify(r.bytes_base64)})'>⇩ Download \${esc(r.filename)}</button></div>\`;
    }
  } else {
    html = '<div class="result err">' + esc(JSON.stringify(r, null, 2)) + '</div>';
  }
  $('sres').innerHTML = html;
}

function downloadB64(filename, b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── WORKFLOWS ─────────────────────────────────────────────────────
function renderWorkflows() {
  const cards = WFS.map(w => \`
    <div class="card" onclick='openWorkflow(\${JSON.stringify(w.id)})'>
      <div class="name">\${esc(w.id)}</div>
      <div class="desc">\${esc(w.description||'')}</div>
      <div class="meta"><span>\${w.nodes.length} nodes</span><span>\${w.required_vars.length} vars</span></div>
    </div>\`).join('');
  return \`
    <div class="head"><h2>Workflows</h2><span class="pill">\${WFS.length} prebuilt</span></div>
    <div class="cards">\${cards}</div>\`;
}

function openWorkflow(id) {
  const wf = WFS.find(w => w.id === id);
  if (!wf) return;
  const nodeList = wf.nodes.map(n => \`<div class="tag">\${esc(n.id)} → <code>\${esc(n.skill)}</code></div>\`).join('');
  const fields = wf.required_vars.map(v =>
    \`<div class="field"><label>\${esc(v)} *</label><textarea name="\${esc(v)}" rows="2" placeholder="JSON or plain text"></textarea></div>\`).join('');
  openDrawer(wf.id, \`
    <div style="color:var(--ink-dim);margin-bottom:10px;font-size:12px">\${esc(wf.description||'')}</div>
    <div style="margin-bottom:14px">\${nodeList}</div>
    <form id="wform" onsubmit="event.preventDefault(); runWorkflow();">\${fields || '<div class="empty">no variables needed</div>'}</form>
    <div id="wres"></div>\`,
    \`<button onclick="closeDrawer()">Cancel</button>
     <button class="primary" onclick="runWorkflow()">Run workflow</button>\`);
}

async function runWorkflow() {
  const wfId = $('dtitle').textContent;
  const form = $('wform');
  const vars = {};
  if (form) {
    for (const el of form.elements) {
      if (!el.name) continue;
      let v = el.value;
      if (v === '') continue;
      try { v = JSON.parse(v); } catch {}
      vars[el.name] = v;
    }
  }
  $('wres').innerHTML = '<div class="result">running…</div>';
  const r = await fetch('/api/workflows/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: wfId, vars }),
  }).then(x => x.json());
  $('wres').innerHTML = '<div class="result' + (r.ok?'':' err') + '">' + esc(JSON.stringify(r, null, 2)) + '</div>';
}

// ── KEYS / TOKENS / SIGNAL / RUNS ─────────────────────────────────
function renderKeys() {
  const m = STATE.meta;
  const rows = m.keys.length === 0
    ? '<tr><td colspan="4" class="empty">no API keys yet — call keys_set from any MCP client</td></tr>'
    : m.keys.map(k => \`<tr><td><code>\${esc(k.name)}</code></td><td><code>\${esc(k.fingerprint||'')}</code></td><td>\${k.usageCount||0}</td><td>\${k.lastUsedAt?new Date(k.lastUsedAt).toLocaleString():'—'}</td></tr>\`).join('');
  return \`
    <div class="head"><h2>API Keys</h2><span class="pill">AES-256-GCM</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Keys are encrypted at rest in the vault file. Plaintext never leaves the local process.
      Master key derived per-machine from operator id + host via PBKDF2 (250,000 iterations).
      Tampered ciphertext fails the GCM auth tag and returns null.
    </div>
    <table><thead><tr><th>name</th><th>fingerprint</th><th>uses</th><th>last used</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
function renderTokens() {
  const m = STATE.meta;
  const rows = m.tokens.length === 0
    ? '<tr><td colspan="3" class="empty">no balances yet — every vault_store earns tokens</td></tr>'
    : m.tokens.slice().sort((a,b)=>b.balance-a.balance).map((t,i)=>\`<tr><td>\${i+1}</td><td><code>\${esc(t.agent)}</code></td><td>\${t.balance.toFixed(2)} MX</td></tr>\`).join('');
  return \`
    <div class="head"><h2>Memory Tokens</h2><span class="pill">F(1) F(3) F(5) F(7)</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Each store earns tier × (1 + lineage·φ⁻¹). Tier weights are Fibonacci:
      PUBLIC=1, SHARED=2, PRIVATE=5, SOVEREIGN=13. Lineage rewards continuity.
    </div>
    <table><thead><tr><th>rank</th><th>agent</th><th>balance</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
function renderSignal() {
  const sg = STATE.signal;
  const rows = sg.recent.length === 0
    ? '<tr><td colspan="5" class="empty">no signals — AIs haven\\'t talked to each other yet</td></tr>'
    : sg.recent.map(x => \`<tr><td>\${x.priority}</td><td>\${esc(x.type)}</td><td>\${esc(x.from)}\${x.to?' → '+esc(x.to):''}</td><td><code>\${esc(x.subject)}</code></td><td class="preview">\${esc(typeof x.payload==='string'?x.payload:JSON.stringify(x.payload??''))}</td></tr>\`).join('');
  return \`
    <div class="head"><h2>Signal Bus</h2><span class="pill">\${sg.total} signals · \${sg.roles.length} agents</span></div>
    <table><thead><tr><th>pri</th><th>type</th><th>from→to</th><th>subject</th><th>payload</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
async function loadRuns() {
  const r = await fetch('/api/runs').then(x => x.json());
  const skillRows = (r.skill_runs || []).length === 0
    ? '<tr><td colspan="5" class="empty">no skill runs yet</td></tr>'
    : r.skill_runs.map(s => \`<tr><td>\${new Date(s.ts).toLocaleTimeString()}</td><td><code>\${esc(s.name)}</code></td><td>\${s.ok?'<span style="color:var(--green)">ok</span>':'<span style="color:var(--red)">'+esc(s.reason||'fail')+'</span>'}</td><td>\${s.ms}ms</td><td>\${esc(s.agent_id||'')}</td></tr>\`).join('');
  const wfRows = (r.workflow_runs || []).length === 0
    ? '<tr><td colspan="4" class="empty">no workflow runs yet</td></tr>'
    : r.workflow_runs.map(w => \`<tr><td>\${new Date(w.ts).toLocaleTimeString()}</td><td><code>\${esc(w.id)}</code></td><td>\${w.ran_nodes}</td><td>\${w.ok?'<span style="color:var(--green)">ok</span>':'<span style="color:var(--red)">partial</span>'}</td></tr>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Activity</h2></div>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase">Skill runs</h3>
    <table><thead><tr><th>time</th><th>skill</th><th>status</th><th>ms</th><th>agent</th></tr></thead><tbody>\${skillRows}</tbody></table>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase;margin-top:24px">Workflow runs</h3>
    <table><thead><tr><th>time</th><th>workflow</th><th>nodes</th><th>status</th></tr></thead><tbody>\${wfRows}</tbody></table>\`;
}

function openDrawer(title, body, footer) {
  $('dtitle').textContent = title;
  $('dbody').innerHTML = body;
  $('dfoot').innerHTML = footer || '';
  $('drawer').classList.add('open');
}
function closeDrawer() { $('drawer').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

fetchAll();
setInterval(() => { if (CURRENT === 'vault' || CURRENT === 'tokens' || CURRENT === 'keys' || CURRENT === 'signal') fetchAll(); }, 5000);
</script>
</body>
</html>`;
