/**
 * GET /api/account — return the current tenant's credit balance and
 * account info. Requires X-Aether-Api-Key.
 */

import { getTenantByApiKey } from './tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export async function onRequestGet({ request, env }) {
  const apiKey = request.headers.get('X-Aether-Api-Key');
  if (!apiKey) return json({ error: 'missing_api_key' }, 401);

  const tenant = await getTenantByApiKey(env.AETHER_CLOUD_KV, apiKey);
  if (!tenant) return json({ error: 'invalid_api_key' }, 401);

  return json({
    tenant_id: tenant.tenantId,
    email: tenant.email,
    plan: tenant.plan,
    status: tenant.status,
    credits: tenant.credits,
  });
}
