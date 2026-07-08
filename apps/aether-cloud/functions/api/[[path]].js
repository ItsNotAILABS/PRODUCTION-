/**
 * Aether Cloud — multi-tenant API, gated by an internal credit economy.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Every request must carry an `X-Aether-Api-Key` header identifying a
 * tenant. Delegates actual fleet/workload/protocol/policy logic to the
 * SAME route() function the free self-hosted console uses
 * (apps/aether-console/functions/api/core.js) — not a fork of it — so
 * "Aether Cloud" and "the self-hosted console" can never drift into
 * different behavior for the same API call.
 *
 * What's added here, on top of core.js, is the commercial layer: tenant
 * resolution, per-tenant state isolation (one KV entry per tenant
 * instead of one global blob), and credit-cost enforcement — billable
 * actions (registering a target, deploying a protocol or workload) cost
 * credits, deducted only after the underlying action actually succeeds.
 * Real payment processing (Stripe) is deferred; see tenants.js's header
 * comment for how to re-enable it later without rebuilding this.
 */

import { freshState, route } from '../../../aether-console/functions/api/core.js';
import { getTenantByApiKey, isTenantActive, CREDIT_COSTS, adjustCredits } from './tenants.js';

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

function creditCostFor(method, parts) {
  if (method !== 'POST') return 0;
  if (parts[0] === 'fleet' && parts[1] === 'register') return CREDIT_COSTS.register_target;
  if (parts[0] === 'protocols' && parts.length === 3 && parts[2] === 'deploy') return CREDIT_COSTS.deploy_protocol;
  if (parts[0] === 'workloads' && parts.length === 1) return CREDIT_COSTS.deploy_workload;
  return 0;
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
    return json({ error: 'suspended_tenant' }, 403);
  }

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const body = request.method === 'POST' ? await readBody(request) : {};

  // No demo-target seeding for tenants — they're registering their own
  // infrastructure, not looking at a canned demo fleet.
  const stateKey = `tenant:${tenant.tenantId}:state`;
  const state = (await kv.get(stateKey, 'json')) || freshState(false);

  const cost = creditCostFor(request.method, parts);
  if (cost > 0 && tenant.credits < cost) {
    return json({
      error: 'insufficient_credits',
      detail: `This action costs ${cost} credits; you have ${tenant.credits}. Redeem a code to top up.`,
      required: cost,
      balance: tenant.credits,
    }, 402);
  }

  const { status, data, dirty } = route(request.method, url.pathname, body, state);

  if (dirty) await kv.put(stateKey, JSON.stringify(state));

  // Only charge for actions that actually succeeded (2xx) — a rejected
  // or failed action (bad target class, unknown protocol, etc.) is free.
  if (cost > 0 && status >= 200 && status < 300) {
    await adjustCredits(kv, apiKey, -cost);
  }

  return json(data, status);
}
