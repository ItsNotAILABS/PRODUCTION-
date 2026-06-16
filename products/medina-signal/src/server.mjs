#!/usr/bin/env node
// server.mjs — MEDINA SIGNAL MCP server.
// Cross-AI signal bus over MCP stdio. Zero deps. Node ≥ 20. MIT.

import { stdin, stdout, stderr, env, argv } from 'node:process';
import { SignalBus, defaultBusPath, loadSnapshot, saveSnapshot, TYPES, PRIORITIES } from './bus.mjs';

const SERVER_NAME    = 'medina-signal';
const SERVER_VERSION = '0.1.0';
const PROTOCOL       = 'MEDINA-PROTOCOL/0.1';
const MCP_VERSION    = '2024-11-05';

const BUS_PATH = defaultBusPath();
const bus = new SignalBus();
const snap = await loadSnapshot(BUS_PATH).catch(() => null);
if (snap) bus.loadFromJSON(snap);

const OPERATOR = env.MEDINA_OPERATOR_ID || env.USER || env.USERNAME || 'operator';

async function persist() {
  try { await saveSnapshot(bus.toJSON(), BUS_PATH); }
  catch (e) { stderr.write(`[medina-signal] persist failed: ${e.message}\n`); }
}

const tools = {
  signal_register: {
    description: 'Register an agent under a role so ROLE-type signals can route to it.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        role:     { type: 'string', description: 'Free-form role tag, e.g. LEAD, CRITIC, MEMORY_CURATOR.' },
      },
      required: ['agent_id', 'role'],
    },
    handler: async (a) => { const r = bus.register(a.agent_id, a.role); if (r.ok) await persist(); return r; },
  },

  signal_emit: {
    description: 'Send a signal. type BROADCAST (all) | DIRECT (to agent_id) | ROLE (to all agents with that role) | URGENT (broadcast + priority bump). CRITICAL priority forces immediate delivery semantics on consuming clients.',
    inputSchema: {
      type: 'object',
      properties: {
        from:     { type: 'string' },
        subject:  { type: 'string' },
        payload:  {},
        type:     { type: 'string', enum: TYPES, default: 'BROADCAST' },
        to:       { type: 'string', description: 'agent_id for DIRECT, role for ROLE.' },
        priority: { type: 'string', enum: PRIORITIES, default: 'NORMAL' },
      },
      required: ['from', 'subject'],
    },
    handler: async (a) => { const r = bus.emit(a); if (r.ok) await persist(); return r; },
  },

  signal_inbox: {
    description: 'Get unread signals addressed to an agent (BROADCAST + URGENT + matching DIRECT/ROLE). Sorted by priority then recency.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id:       { type: 'string' },
        include_read:   { type: 'boolean', default: false },
        min_priority:   { type: 'string', enum: PRIORITIES },
        subject_prefix: { type: 'string' },
        limit:          { type: 'number', default: 50 },
      },
      required: ['agent_id'],
    },
    handler: async (a) => bus.inbox(a.agent_id, {
      includeRead: a.include_read, minPriority: a.min_priority,
      subjectPrefix: a.subject_prefix, limit: a.limit,
    }),
  },

  signal_mark_read: {
    description: 'Mark signal(s) as read for an agent. Pass signal_id to mark one, omit to mark all addressed.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id:  { type: 'string' },
        signal_id: { type: 'string' },
      },
      required: ['agent_id'],
    },
    handler: async (a) => { const r = bus.markRead(a.agent_id, a.signal_id); if (r.ok) await persist(); return r; },
  },

  signal_history: {
    description: 'Browse signal history. Optional filters: from, type, since (ISO timestamp).',
    inputSchema: {
      type: 'object',
      properties: {
        from:  { type: 'string' },
        type:  { type: 'string', enum: TYPES },
        since: { type: 'string' },
        limit: { type: 'number', default: 100 },
      },
    },
    handler: async (a) => ({ ok: true, signals: bus.history(a) }),
  },

  signal_status: {
    description: 'Report bus status: total signals, registered agents, supported types and priorities.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, protocol: PROTOCOL, operator: OPERATOR,
                            bus_path: BUS_PATH, ...bus.status() }),
  },
};

function send(m) { stdout.write(JSON.stringify(m) + '\n'); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function toolContent(p) {
  return { content: [{ type: 'text', text: JSON.stringify(p, null, 2) }], isError: p?.ok === false };
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'notifications/initialized') return;
  if (id == null) return;
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Medina Signal — sovereign cross-AI signal bus under MEDINA-PROTOCOL/0.1. ' +
          'Register your agent_id + role first, then emit/inbox. ROLE-type signals only route ' +
          'to agents that have registered with that role.',
      });
    case 'tools/list':
      return reply(id, { tools: Object.entries(tools).map(([name, t]) => ({
        name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const t = tools[params?.name];
      if (!t) return replyError(id, -32601, `Unknown tool: ${params?.name}`);
      try { return reply(id, toolContent(await t.handler(params.arguments ?? {}))); }
      catch (e) { return reply(id, toolContent({ ok: false, reason: 'INTERNAL_ERROR', message: e.message })); }
    }
    default:
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', async (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
    if (!line) continue;
    try { await handle(JSON.parse(line)); }
    catch (e) { stderr.write(`[medina-signal] bad message: ${e.message}\n`); }
  }
});
stdin.on('end', () => process.exit(0));
stderr.write(`[medina-signal] online · protocol=${PROTOCOL} · operator=${OPERATOR} · bus=${BUS_PATH}\n`);

if (argv.includes('--smoke')) {
  await (await import('./_smoke.mjs')).run();
  process.exit(0);
}
