/**
 * POST /api/credits/generate — operator-only. Mints a redemption code
 * worth N credits, to hand out however you like (email, Discord, manual
 * invoice) — the substitute for a Stripe checkout while payment
 * processing is deferred.
 *
 * Requires X-Admin-Secret matching the AETHER_CLOUD_ADMIN_SECRET Pages
 * secret. Set it with:
 *   wrangler pages secret put AETHER_CLOUD_ADMIN_SECRET
 * Pick your own long random value — this is yours, not Stripe's.
 */

import { generateRedemptionCode } from '../tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
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
  if (!env.AETHER_CLOUD_ADMIN_SECRET) {
    return json({ error: 'admin_secret_not_configured' }, 500);
  }
  const provided = request.headers.get('X-Admin-Secret');
  if (!provided || provided !== env.AETHER_CLOUD_ADMIN_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }

  let body = {};
  try { body = await request.json(); } catch { /* validated below */ }
  const credits = Number(body.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    return json({ error: 'invalid_credits' }, 400);
  }

  const code = await generateRedemptionCode(env.AETHER_CLOUD_KV, credits);
  return json({ code, credits });
}
