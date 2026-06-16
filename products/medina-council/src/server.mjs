#!/usr/bin/env node
// server.mjs — MEDINA COUNCIL MCP server.
// Multi-AI consensus desk over MCP stdio. Zero deps. Node ≥ 20. MIT.

import { stdin, stdout, stderr, env, argv } from 'node:process';
import { Council, DEFAULT_ROLE_WEIGHTS } from './council.mjs';

const SERVER_NAME    = 'medina-council';
const SERVER_VERSION = '0.1.0';
const PROTOCOL       = 'MEDINA-PROTOCOL/0.1';
const MCP_VERSION    = '2024-11-05';

const OPERATOR = env.MEDINA_OPERATOR_ID || env.USER || env.USERNAME || 'operator';
const council  = new Council();

// ── Tools ────────────────────────────────────────────────────────────────

const tools = {
  council_open: {
    description: 'Open a new vote on a task. Returns taskId. Vote with council_vote, then resolve with council_resolve.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id:  { type: 'string', description: 'Unique task id.' },
        prompt:   { type: 'string', description: 'What the council is voting on.' },
        agent_id: { type: 'string', description: 'Opener (defaults to operator).' },
      },
      required: ['task_id', 'prompt'],
    },
    handler: async (a) => council.open(a.task_id, a.prompt, a.agent_id || OPERATOR),
  },

  council_vote: {
    description: 'Submit a vote on an open task. Confidence 0-1. Roles map to Solfeggio-derived authority weights. SOVEREIGN role holds veto when confidence < floor.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id:    { type: 'string' },
        agent_id:   { type: 'string' },
        role:       { type: 'string', enum: Object.keys(DEFAULT_ROLE_WEIGHTS) },
        content:    { description: 'Your output / position (any JSON value).' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning:  { type: 'string' },
      },
      required: ['task_id', 'agent_id', 'role', 'content', 'confidence'],
    },
    handler: async (a) => council.vote({
      taskId: a.task_id, agentId: a.agent_id, role: a.role,
      content: a.content, confidence: a.confidence, reasoning: a.reasoning,
    }),
  },

  council_resolve: {
    description: 'Close voting and return the weighted consensus. Approved when approvalRatio ≥ φ⁻¹ (0.618) AND no veto fired.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
    handler: async (a) => council.resolve(a.task_id),
  },

  council_list: {
    description: 'List tasks. Optional filter: status (OPEN | APPROVED | VETOED | REJECTED).',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['OPEN','APPROVED','VETOED','REJECTED'] } },
    },
    handler: async (a) => ({ ok: true, tasks: council.list({ status: a.status }) }),
  },

  council_status: {
    description: 'Report council status: thresholds, veto roles, task counts by state.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({
      ok: true, protocol: PROTOCOL, operator: OPERATOR,
      roles_known: Object.keys(DEFAULT_ROLE_WEIGHTS),
      ...council.status(),
    }),
  },
};

// ── JSON-RPC over stdio ─────────────────────────────────────────────────

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
          'Medina Council — sovereign multi-AI consensus desk under MEDINA-PROTOCOL/0.1. ' +
          'Open a task, vote with role + confidence, resolve. Approval needs ratio ≥ φ⁻¹ ' +
          '(0.618) and no veto. Roles below confidence floor (0.4) don\'t count toward approve.',
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
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    try { await handle(JSON.parse(line)); }
    catch (e) { stderr.write(`[medina-council] bad message: ${e.message}\n`); }
  }
});
stdin.on('end', () => process.exit(0));
stderr.write(`[medina-council] online · protocol=${PROTOCOL} · operator=${OPERATOR}\n`);

if (argv.includes('--smoke')) {
  await (await import('./_smoke.mjs')).run();
  process.exit(0);
}
