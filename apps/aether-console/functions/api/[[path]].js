/**
 * Aether Sovereign Console — Cloudflare Pages Functions transport.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Thin adapter over core.js's route() — all route logic lives there so
 * it's shared byte-for-byte with the Electron desktop app
 * (apps/aether-desktop/main.js). This file only handles Cloudflare's
 * Request/Response/KV plumbing.
 *
 * State persists in a Cloudflare KV namespace bound as AETHER_KV.
 * Single JSON blob under key "state" — fine for a single-tenant console.
 */

import { freshState, route } from './core.js';

async function loadState(kv, seedDemo = false) {
  if (!kv) return freshState(seedDemo);
  const raw = await kv.get('state', 'json');
  return raw || freshState(seedDemo);
}

async function saveState(kv, state) {
  if (!kv) return;
  await kv.put('state', JSON.stringify(state));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function readBody(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch { return {}; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.AETHER_KV;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const body = request.method === 'POST' ? await readBody(request) : {};
  const state = await loadState(kv, env.AETHER_SEED_DEMO === '1');

  const { status, data, dirty } = route(request.method, url.pathname, body, state);

  // Surface whether state actually persists (KV bound), so the UI can warn
  // honestly instead of guessing from an empty fleet — which used to be a
  // proxy back when a fresh console always seeded demo targets.
  if (url.pathname.replace(/\/$/, '').endsWith('/health') && data && typeof data === 'object') {
    data.persistent = !!kv;
  }

  if (dirty) await saveState(kv, state);
  return json(data, status);
}
