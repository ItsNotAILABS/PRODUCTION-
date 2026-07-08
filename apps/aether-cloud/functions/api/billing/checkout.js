/**
 * POST /api/billing/checkout — create a Stripe Checkout Session for an
 * upgrade. Calls Stripe's REST API directly via fetch (no stripe-node
 * SDK — it depends on Node APIs that don't all exist in the Workers
 * runtime, and this repo's whole ethos is zero external dependencies).
 *
 * Requires these to be set as Pages environment variables/secrets:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_ID_STARTER
 *   STRIPE_PRICE_ID_PRO
 */

import { getTenantByApiKey } from '../tenants.js';

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

const PRICE_ENV_BY_PLAN = {
  starter: 'STRIPE_PRICE_ID_STARTER',
  pro: 'STRIPE_PRICE_ID_PRO',
};

export async function onRequestPost({ request, env }) {
  const apiKey = request.headers.get('X-Aether-Api-Key');
  if (!apiKey) return json({ error: 'missing_api_key' }, 401);

  const kv = env.AETHER_CLOUD_KV;
  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return json({ error: 'unknown_tenant' }, 404);

  let body = {};
  try { body = await request.json(); } catch { /* validated below */ }

  const plan = body.plan;
  const priceEnvKey = PRICE_ENV_BY_PLAN[plan];
  if (!priceEnvKey) {
    return json({ error: 'unknown_plan', plan, valid_plans: Object.keys(PRICE_ENV_BY_PLAN) }, 400);
  }
  if (!env.STRIPE_SECRET_KEY || !env[priceEnvKey]) {
    return json({
      error: 'stripe_not_configured',
      detail: `Set STRIPE_SECRET_KEY and ${priceEnvKey} in the Pages project's environment variables.`,
    }, 500);
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': env[priceEnvKey],
    'line_items[0][quantity]': '1',
    success_url: body.success_url || `${origin}/?checkout=success`,
    cancel_url: body.cancel_url || `${origin}/?checkout=cancelled`,
    customer_email: tenant.email,
    'metadata[api_key]': apiKey,
    'metadata[tenant_id]': tenant.tenantId,
    'metadata[plan]': plan,
  });

  let stripeRes;
  try {
    stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (e) {
    return json({ error: 'stripe_unreachable', detail: e.message }, 502);
  }

  const session = await stripeRes.json();
  if (!stripeRes.ok) {
    return json({ error: 'stripe_error', detail: session.error?.message || 'unknown' }, 502);
  }

  return json({ checkout_url: session.url, session_id: session.id });
}
