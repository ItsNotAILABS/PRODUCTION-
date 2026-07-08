/**
 * POST /api/billing/webhook — Stripe webhook receiver.
 *
 * Verifies the Stripe-Signature header using the Web Crypto API
 * (available natively in both the Workers runtime and modern Node —
 * no crypto library dependency). Register this URL as the webhook
 * endpoint in the Stripe dashboard, subscribed to at minimum:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *
 * Requires STRIPE_WEBHOOK_SECRET as a Pages environment variable/secret.
 */

import { linkStripeCustomer, updateTenantByStripeCustomer } from '../tenants.js';

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time-ish compare (length-checked first, then XOR-accumulate).
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature');

  if (env.STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) return new Response('invalid signature', { status: 400 });
  }
  // If STRIPE_WEBHOOK_SECRET isn't set yet, requests are accepted unverified —
  // fine for initial local wiring, not for production. The checkout endpoint
  // already refuses to run without STRIPE_SECRET_KEY configured, so this is
  // the one place a half-configured deployment stays silently insecure —
  // flagged here deliberately rather than left implicit.

  let event;
  try { event = JSON.parse(payload); } catch { return new Response('bad json', { status: 400 }); }

  const kv = env.AETHER_CLOUD_KV;
  const obj = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const apiKey = obj.metadata?.api_key;
    if (apiKey && obj.customer) {
      await linkStripeCustomer(kv, apiKey, obj.customer);
      await updateTenantByStripeCustomer(kv, obj.customer, {
        status: 'active',
        stripeSubscriptionId: obj.subscription || null,
        plan: obj.metadata?.plan || 'starter',
      });
    }
  } else if (event.type === 'customer.subscription.deleted') {
    await updateTenantByStripeCustomer(kv, obj.customer, { status: 'cancelled' });
  } else if (event.type === 'customer.subscription.updated') {
    if (obj.status === 'past_due' || obj.status === 'unpaid') {
      await updateTenantByStripeCustomer(kv, obj.customer, { status: 'past_due' });
    } else if (obj.status === 'active') {
      await updateTenantByStripeCustomer(kv, obj.customer, { status: 'active' });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export { verifyStripeSignature };
