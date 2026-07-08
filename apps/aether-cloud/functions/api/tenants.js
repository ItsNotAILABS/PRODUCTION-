/**
 * Aether Cloud — tenant registry.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure functions, no Request/Response — a single JSON blob in the
 * AETHER_CLOUD_KV namespace under key "tenants", keyed by API key
 * (byApiKey) with a reverse index by Stripe customer ID (byStripeCustomer)
 * for webhook updates.
 *
 * Honest scale note: a single KV blob is fine for dozens-to-low-hundreds
 * of tenants. Past that, move this to D1 or a Durable Object per tenant —
 * KV writes are eventually consistent and this does read-modify-write on
 * every signup/webhook, which will start colliding under real concurrency.
 */

'use strict';

const PLAN_LIMITS = {
  trial:      { maxTargets: 1,        maxProtocolDeploys: 3,        label: 'Trial (7 days)' },
  starter:    { maxTargets: 5,        maxProtocolDeploys: Infinity, label: 'Starter' },
  pro:        { maxTargets: 25,       maxProtocolDeploys: Infinity, label: 'Pro' },
  enterprise: { maxTargets: Infinity, maxProtocolDeploys: Infinity, label: 'Enterprise' },
};

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

function genApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `aeth_${hex}`;
}

function genTenantId() {
  return `ten_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function loadRegistry(kv) {
  if (!kv) return { byApiKey: {}, byStripeCustomer: {} };
  const raw = await kv.get('tenants', 'json');
  return raw || { byApiKey: {}, byStripeCustomer: {} };
}

async function saveRegistry(kv, registry) {
  if (!kv) return;
  await kv.put('tenants', JSON.stringify(registry));
}

async function createTenant(kv, { email, plan = 'trial' }) {
  const registry = await loadRegistry(kv);
  const apiKey = genApiKey();
  const tenantId = genTenantId();
  const tenant = {
    tenantId, email, plan,
    status: plan === 'trial' ? 'trialing' : 'pending_payment',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: Date.now(),
    trialEndsAt: plan === 'trial' ? Date.now() + TRIAL_MS : null,
  };
  registry.byApiKey[apiKey] = tenant;
  await saveRegistry(kv, registry);
  return { apiKey, tenant };
}

async function getTenantByApiKey(kv, apiKey) {
  if (!apiKey) return null;
  const registry = await loadRegistry(kv);
  return registry.byApiKey[apiKey] || null;
}

async function linkStripeCustomer(kv, apiKey, stripeCustomerId) {
  const registry = await loadRegistry(kv);
  if (!registry.byApiKey[apiKey]) return null;
  registry.byApiKey[apiKey].stripeCustomerId = stripeCustomerId;
  registry.byStripeCustomer[stripeCustomerId] = apiKey;
  await saveRegistry(kv, registry);
  return registry.byApiKey[apiKey];
}

async function updateTenantByStripeCustomer(kv, stripeCustomerId, patch) {
  const registry = await loadRegistry(kv);
  const apiKey = registry.byStripeCustomer[stripeCustomerId];
  if (!apiKey || !registry.byApiKey[apiKey]) return null;
  Object.assign(registry.byApiKey[apiKey], patch);
  await saveRegistry(kv, registry);
  return registry.byApiKey[apiKey];
}

function planLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
}

function isTenantActive(tenant) {
  if (!tenant) return false;
  if (tenant.status === 'trialing' && tenant.plan === 'trial') {
    return !tenant.trialEndsAt || Date.now() <= tenant.trialEndsAt;
  }
  return tenant.status === 'active';
}

module.exports = {
  PLAN_LIMITS, planLimits, isTenantActive,
  createTenant, getTenantByApiKey, linkStripeCustomer, updateTenantByStripeCustomer,
  genApiKey, genTenantId,
};
