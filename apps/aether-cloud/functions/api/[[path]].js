/**
 * Aether Cloud — multi-tenant, billed API.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Every request must carry an `X-Aether-Api-Key` header identifying a
 * tenant. Delegates actual fleet/workload/protocol/policy logic to the
 * SAME route() function the free self-hosted console uses
 * (apps/aether-console/functions/api/core.js) — not a fork of it — so
 * "Aether Cloud" and "the self-hosted console" can never drift into
 * different behavior for the same API call.
 *
 * What's added here, on top of core.js, is the commercial layer:
 * tenant resolution, per-tenant state isolation (one KV entry per
 * tenant instead of one global blob), and plan-limit enforcement.
 */

import { freshState, route } from '../../../aether-console/functions/api/core.js';
import { getTenantByApiKey, isTenantActive, planLimits } from './tenants.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Aether-Api-Key',
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
  const kv = env.AETHER_CLOUD_KV;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const apiKey = request.headers.get('X-Aether-Api-Key');
  if (!apiKey) return json({ error: 'missing_api_key' }, 401);

  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return json({ error: 'invalid_api_key' }, 401);
  if (!isTenantActive(tenant)) {
    return json({ error: 'inactive_tenant', status: tenant.status, plan: tenant.plan }, 402);
  }

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const body = request.method === 'POST' ? await readBody(request) : {};

  // No demo-target seeding for paying/trial tenants — they're registering
  // their own infrastructure, and the free console's 3-target demo seed
  // would immediately exceed the trial plan's 1-target limit.
  const stateKey = `tenant:${tenant.tenantId}:state`;
  const state = (await kv.get(stateKey, 'json')) || freshState(false);

  // Plan-limit enforcement — the part that makes tiers actually mean something.
  const limits = planLimits(tenant.plan);

  if (request.method === 'POST' && parts[0] === 'fleet' && parts[1] === 'register') {
    const currentTargets = Object.keys(state.targets || {}).length;
    if (currentTargets >= limits.maxTargets) {
      return json({
        error: 'plan_limit_exceeded',
        detail: `Plan '${tenant.plan}' allows up to ${limits.maxTargets} target(s). Upgrade to add more.`,
      }, 402);
    }
  }

  if (request.method === 'POST' && parts[0] === 'protocols' && parts[2] === 'deploy') {
    if (limits.maxProtocolDeploys !== Infinity) {
      const deployedCount = Object.values(state.workloads || {}).filter((w) => w.kind === 'protocol').length;
      if (deployedCount >= limits.maxProtocolDeploys) {
        return json({
          error: 'plan_limit_exceeded',
          detail: `Plan '${tenant.plan}' allows up to ${limits.maxProtocolDeploys} protocol deploy(s). Upgrade for unlimited.`,
        }, 402);
      }
    }
  }

  const { status, data, dirty } = route(request.method, url.pathname, body, state);

  if (dirty) await kv.put(stateKey, JSON.stringify(state));

  return json(data, status);
}
