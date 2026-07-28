/**
 * Worker Studio (JS) — Claude builds a custom worker on request.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The JS twin of aether_platform/studio: describe a worker in plain language
 * and Claude writes it in the Foundry's house style, grounded in the 40-type
 * catalog. Runs on the Cloudflare and desktop transports (both provide a
 * global `fetch`), so the Studio isn't Python-only.
 *
 * HONEST about credentials — with no API key it throws `no_api_key` and the
 * transport returns 402; it never fabricates a worker. Default model:
 * claude-opus-4-8. Called from the transport layer (which holds `env`), not
 * from the pure route() core.
 */
'use strict';

let FOUNDRY = null;
try { FOUNDRY = require('./foundry.js'); } catch (e) { FOUNDRY = null; }

const API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the Worker Studio for the Aether Sovereign Platform. You write real,
self-contained "headless workers" — small programs a developer downloads and
runs to do one job unattended (compute nodes, web spiders, scrapers, browser
automation, data/ETL jobs, monitors, relays, LLM/embedding pipelines).

House style (match it):
- Prefer the Python standard library only; no third-party deps unless the job
  truly needs them (Playwright for real-browser work; note it in \`needs\`).
- One self-contained file with an argparse CLI whose defaults come from the
  user's request, so it runs out of the box and every knob is also a flag.
- Emit progress/results as JSON lines to stdout; errors to stderr.
- For a mesh compute node: claim -> compute -> submit against a coordinator's
  /mesh/claim and /mesh/submit endpoints.
- For headless-browser work: Node + Playwright, launching headless Chromium
  with a fallback executablePath, capturing console + network.
- Be honest about anything that needs a credential or an external endpoint.

Return ONLY a single JSON object, no prose, with these fields:
  "filename":  a good filename (e.g. "spider.py", "screenshot.js")
  "runtime":   "python" or "node"
  "code":      the complete file contents as a string
  "run":       the exact shell command to run it
  "needs":     array of short strings — deps/keys/services required (may be [])
  "notes":     one or two sentences on what it does and how to adapt it`;

const CONFIGURE_SYSTEM = `You recommend parameter values for an EXISTING Aether Worker Foundry
blueprint, given what the operator says they want it to do. You are not
writing code — the blueprint's code is fixed; you are only choosing good
values for its declared parameters.

Return ONLY a single JSON object, no prose:
  "params":    an object mapping ONLY the declared parameter names (exactly
               as given) to recommended string values. Do not invent new
               parameter names. Omit a parameter to leave it at its default.
  "rationale": one or two sentences explaining the choices, in plain language.`;

const REMIX_SYSTEM = `You extend or adapt an EXISTING Aether Worker Foundry blueprint into a new,
complete worker. You are given the blueprint's real source file as a starting
point — keep what already works, change only what the request asks for, and
keep the same house style (argparse CLI, JSONL to stdout, stdlib-first).

Return ONLY a single JSON object, no prose, with these fields:
  "filename":  a good filename for the new worker (e.g. "spider.py")
  "runtime":   "python" or "node"
  "code":      the complete, updated file contents as a string
  "run":       the exact shell command to run it
  "needs":     array of short strings — deps/keys/services required (may be [])
  "notes":     one or two sentences on what changed from the base blueprint`;

class StudioError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || (message.includes(':') ? message.split(':')[0] : undefined);
  }
}

function catalogContext() {
  if (!FOUNDRY) return '';
  const lines = ['Existing Foundry worker types (for style and to avoid '
    + 'reinventing — if one already fits, say so in notes):'];
  for (const t of FOUNDRY.listTemplates()) {
    lines.push(`- ${t.id} (${t.runtime}): ${t.summary}`);
  }
  return lines.join('\n');
}

function parseWorkerJson(text) {
  const fence = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* fall through */ } }
  try { const o = JSON.parse(text); return (o && typeof o === 'object') ? o : null; } catch (e) { /* */ }
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; } } }
    }
  }
  return null;
}

async function generateWorker({ prompt, apiKey, model, maxTokens } = {}) {
  const key = apiKey || '';
  if (!key) {
    throw new StudioError('no_api_key: Worker Studio needs an Anthropic API key to '
      + 'generate a worker. Set ANTHROPIC_API_KEY (or pass one in the request). The rest '
      + 'of the platform — the 40-template Foundry, the mesh, the browser tools — works without a key.');
  }
  if (!prompt || !prompt.trim()) throw new StudioError('empty_prompt: describe the worker you want.');

  const payload = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens || 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${catalogContext()}\n\nBuild this worker:\n${prompt.trim()}` }],
  };

  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
  } catch (e) { throw new StudioError(`network_error: ${e.message || e}`); }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new StudioError(`api_error ${res.status}: ${detail}`);
  }
  const body = await res.json();
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const spec = parseWorkerJson(text);
  if (!spec) throw new StudioError('parse_error: model did not return a worker object. Head: ' + text.slice(0, 200));

  spec.runtime = spec.runtime || 'python';
  spec.needs = spec.needs || [];
  spec.notes = spec.notes || '';
  spec.run = spec.run || '';
  if (!spec.code || !spec.filename) throw new StudioError('incomplete_worker: model omitted code/filename.');
  spec.usage = body.usage || {};
  spec.model = body.model || payload.model;
  return spec;
}

async function callClaude(payload, key, timeout) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
  } catch (e) { throw new StudioError(`network_error: ${e.message || e}`); }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new StudioError(`api_error ${res.status}: ${detail}`);
  }
  return res.json();
}

// ── configure: recommend param values for an existing template ───────────
async function configureWorker({ templateId, goal, apiKey, model } = {}) {
  const key = apiKey || '';
  if (!key) {
    throw new StudioError('no_api_key: Worker Studio needs an Anthropic API key to '
      + 'recommend a configuration. Set ANTHROPIC_API_KEY (or pass one in the request).');
  }
  if (!goal || !goal.trim()) throw new StudioError('empty_goal: describe what you want this worker to do.');
  if (!FOUNDRY) throw new StudioError('foundry_unavailable: the template catalog is not loaded.');
  const t = FOUNDRY.listTemplates().find((x) => x.id === templateId);
  if (!t) throw new StudioError(`unknown_template: ${templateId}`);

  const blueprint = {
    id: t.id, name: t.name, summary: t.summary,
    params: (t.params || []).map((p) => ({ name: p.name, label: p.label || p.name, default: p.default || '', help: p.help || '' })),
  };
  const payload = {
    model: model || DEFAULT_MODEL,
    max_tokens: 1024,
    system: CONFIGURE_SYSTEM,
    messages: [{ role: 'user', content: `Blueprint:\n${JSON.stringify(blueprint, null, 2)}\n\nGoal:\n${goal.trim()}` }],
  };
  const body = await callClaude(payload, key);
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const spec = parseWorkerJson(text);
  if (!spec) throw new StudioError('parse_error: model did not return a configuration object. Head: ' + text.slice(0, 200));

  const declared = new Set((t.params || []).map((p) => p.name));
  const params = {};
  for (const [k, v] of Object.entries(spec.params || {})) if (declared.has(k)) params[k] = String(v);
  return { template_id: templateId, params, rationale: spec.rationale || '', usage: body.usage || {}, model: body.model || payload.model };
}

// ── remix: adapt an existing template's real source into a new worker ────
async function remixWorker({ templateId, request, apiKey, model, maxTokens } = {}) {
  const key = apiKey || '';
  if (!key) {
    throw new StudioError('no_api_key: Worker Studio needs an Anthropic API key to '
      + 'remix a blueprint. Set ANTHROPIC_API_KEY (or pass one in the request).');
  }
  if (!request || !request.trim()) throw new StudioError('empty_request: describe the change you want.');
  if (!FOUNDRY) throw new StudioError('foundry_unavailable: the template catalog is not loaded.');
  const t = FOUNDRY.listTemplates().find((x) => x.id === templateId);
  if (!t) throw new StudioError(`unknown_template: ${templateId}`);
  const rendered = FOUNDRY.render(templateId, {});
  const baseSource = rendered.files[rendered.entry] || '';
  const ext = (rendered.entry.split('.').pop() || '');

  const payload = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens || 8000,
    system: REMIX_SYSTEM,
    messages: [{
      role: 'user',
      content: `Base blueprint: ${t.id} — ${t.summary}\n\n\`\`\`${ext}\n${baseSource}\n\`\`\`\n\nRequested change:\n${request.trim()}`,
    }],
  };
  const body = await callClaude(payload, key);
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const spec = parseWorkerJson(text);
  if (!spec) throw new StudioError('parse_error: model did not return a worker object. Head: ' + text.slice(0, 200));

  spec.runtime = spec.runtime || t.runtime;
  spec.needs = spec.needs || t.needs || [];
  spec.notes = spec.notes || '';
  spec.run = spec.run || '';
  if (!spec.code || !spec.filename) throw new StudioError('incomplete_worker: model omitted code/filename.');
  spec.base_template_id = templateId;
  spec.usage = body.usage || {};
  spec.model = body.model || payload.model;
  return spec;
}

// ── delivery: bundle any Studio spec into a real, runnable zip ───────────
function bundleSpecZip(spec) {
  const slug = (spec.filename || 'worker').replace(/\.[^.]+$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'worker';
  const filename = spec.filename || 'worker.py';
  const readmeLines = [
    `# ${slug}`, '',
    spec.notes || 'Generated by the Aether Worker Studio.', '',
    `- **Runtime:** ${spec.runtime || 'python'}`,
    '- **Generated by:** Aether Worker Studio (Claude)',
  ];
  if (spec.base_template_id) readmeLines.push(`- **Based on:** ${spec.base_template_id} (Worker Foundry)`);
  readmeLines.push('', '## Run', '', '```bash', spec.run || '', '```', '');
  const needs = spec.needs || [];
  if (needs.length) { readmeLines.push('## Requirements', ''); for (const n of needs) readmeLines.push(`- ${n}`); readmeLines.push(''); }
  const readme = readmeLines.join('\n');

  let runPre = '#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\n\n';
  runPre += spec.runtime === 'node'
    ? "command -v node >/dev/null || { echo 'Node.js required'; exit 1; }\n[ -d node_modules ] || npm i playwright\n"
    : "command -v python3 >/dev/null || { echo 'python3 required'; exit 1; }\n";
  const runSh = runPre + (spec.run || '') + '\n';

  const files = { [filename]: spec.code || '', 'README.md': readme, 'run.sh': runSh };
  const entries = Object.entries(files).map(([path, content]) => ({
    path: `${slug}/${path}`, content, executable: path === filename || path === 'run.sh',
  }));
  return FOUNDRY.packZip(entries);
}

module.exports = {
  generateWorker, configureWorker, remixWorker, bundleSpecZip,
  StudioError, parseWorkerJson, catalogContext,
};
