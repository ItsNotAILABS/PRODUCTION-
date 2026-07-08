/**
 * POST /api/signup — create a trial tenant, no payment required.
 * Returns the API key exactly once; the client is responsible for saving it.
 */

import { createTenant } from './tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
  let body = {};
  try { body = await request.json(); } catch { /* fall through to validation */ }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email.includes('@') || email.length < 5) {
    return json({ error: 'invalid_email' }, 400);
  }

  const kv = env.AETHER_CLOUD_KV;
  const { apiKey, tenant } = await createTenant(kv, { email, plan: 'trial' });

  return json({
    api_key: apiKey,
    tenant_id: tenant.tenantId,
    plan: tenant.plan,
    status: tenant.status,
    trial_ends_at: tenant.trialEndsAt,
    message: 'Save this API key now — it will not be shown again.',
  }, 201);
}
