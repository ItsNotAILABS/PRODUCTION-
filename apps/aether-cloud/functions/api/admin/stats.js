/**
 * GET /api/admin/stats — operator dashboard. Requires X-Admin-Secret
 * matching AETHER_CLOUD_ADMIN_SECRET (same secret that gates code
 * generation). Returns tenant count and total credits outstanding
 * (the operator's credit liability — how many credits customers hold
 * that haven't been spent yet).
 */

import { tenantStats } from '../tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export async function onRequestGet({ request, env }) {
  if (!env.AETHER_CLOUD_ADMIN_SECRET) {
    return json({ error: 'admin_secret_not_configured' }, 500);
  }
  const provided = request.headers.get('X-Admin-Secret');
  if (!provided || provided !== env.AETHER_CLOUD_ADMIN_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }

  const stats = await tenantStats(env.AETHER_CLOUD_KV);
  return json({
    tenants: stats.tenants,
    credits_outstanding: stats.totalCreditsOutstanding,
    generated_at: new Date().toISOString(),
  });
}
