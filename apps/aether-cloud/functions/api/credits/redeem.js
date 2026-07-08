/**
 * POST /api/credits/redeem — redeem a code for credits.
 * Requires X-Aether-Api-Key. Body: { code: "AETH-XXXX-XXXX-XXXX-XXXX" }.
 */

import { redeemCode } from '../tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Aether-Api-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const apiKey = request.headers.get('X-Aether-Api-Key');
  if (!apiKey) return json({ error: 'missing_api_key' }, 401);

  let body = {};
  try { body = await request.json(); } catch { /* validated below */ }
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return json({ error: 'missing_code' }, 400);

  const result = await redeemCode(env.AETHER_CLOUD_KV, apiKey, code);
  if (!result.ok) {
    const statusByError = { invalid_code: 404, code_already_used: 409, unknown_tenant: 401 };
    return json({ error: result.error }, statusByError[result.error] || 400);
  }

  return json({ credited: result.credited, balance: result.newBalance });
}
