/**
 * Worker Studio (JS) — Claude builds a custom worker on request.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The JS twin of aether_platform/studio: describe a worker in plain language
 * and Claude writes it in the Foundry's house style, grounded in the 20-type
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

class StudioError extends Error {}

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
      + 'of the platform — the 20-template Foundry, the mesh, the browser tools — works without a key.');
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

module.exports = { generateWorker, StudioError, parseWorkerJson, catalogContext };
