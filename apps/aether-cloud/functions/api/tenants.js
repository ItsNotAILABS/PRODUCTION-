/**
 * Aether Cloud — tenant registry + internal credit economy.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure functions, no Request/Response — a single JSON blob in the
 * AETHER_CLOUD_KV namespace under key "tenants", keyed by API key
 * (byApiKey) with a reverse index by Stripe customer ID (byStripeCustomer,
 * kept for later — see note below).
 *
 * MONETIZATION MODEL: internal credits, not live payment processing.
 * Every tenant gets a free signup grant; billable actions (registering a
 * target, deploying a protocol or workload) cost credits; the operator
 * hands out more via redemption codes (functions/api/credits/generate.js
 * is admin-gated — you generate a code, give it to a customer however
 * you like — email, Discord, a manual invoice — and they redeem it).
 * This makes the whole product usable end-to-end today without any
 * external payment processor configured.
 *
 * Stripe wiring (linkStripeCustomer, updateTenantByStripeCustomer, and
 * functions/api/billing/*.js) is left in place but dormant — not deleted,
 * not wired into the gating logic below. Re-enabling real billing later
 * means restoring the credit-cost checks in [[path]].js to check a paid
 * plan instead of/alongside a credit balance; it doesn't mean rebuilding
 * this file.
 *
 * Honest scale note: a single KV blob is fine for dozens-to-low-hundreds
 * of tenants. Past that, move this to D1 or a Durable Object per tenant —
 * KV writes are eventually consistent and this does read-modify-write on
 * every signup/redemption, which will start colliding under real
 * concurrency.
 */

'use strict';

const SIGNUP_CREDITS = 500;

const CREDIT_COSTS = {
  register_target: 50,
  deploy_protocol: 100,
  deploy_workload: 75,
};

function genApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `aeth_${hex}`;
}

function genTenantId() {
  return `ten_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function genRedemptionCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `AETH-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
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

async function loadCodes(kv) {
  if (!kv) return {};
  const raw = await kv.get('redemption_codes', 'json');
  return raw || {};
}

async function saveCodes(kv, codes) {
  if (!kv) return;
  await kv.put('redemption_codes', JSON.stringify(codes));
}

async function createTenant(kv, { email, plan = 'trial' }) {
  const registry = await loadRegistry(kv);
  const apiKey = genApiKey();
  const tenantId = genTenantId();
  const tenant = {
    tenantId, email, plan,
    status: 'active',        // credits gate usage now, not subscription status
    credits: SIGNUP_CREDITS,
    stripeCustomerId: null,  // dormant — see file header
    stripeSubscriptionId: null,
    createdAt: Date.now(),
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

async function adjustCredits(kv, apiKey, delta) {
  const registry = await loadRegistry(kv);
  const tenant = registry.byApiKey[apiKey];
  if (!tenant) return null;
  tenant.credits = Math.max(0, tenant.credits + delta);
  await saveRegistry(kv, registry);
  return tenant;
}

async function generateRedemptionCode(kv, credits) {
  const codes = await loadCodes(kv);
  const code = genRedemptionCode();
  codes[code] = { credits, used: false, usedBy: null, createdAt: Date.now(), usedAt: null };
  await saveCodes(kv, codes);
  return code;
}

async function redeemCode(kv, apiKey, code) {
  const codes = await loadCodes(kv);
  const entry = codes[code];
  if (!entry) return { ok: false, error: 'invalid_code' };
  if (entry.used) return { ok: false, error: 'code_already_used' };

  const registry = await loadRegistry(kv);
  const tenant = registry.byApiKey[apiKey];
  if (!tenant) return { ok: false, error: 'unknown_tenant' };

  tenant.credits += entry.credits;
  entry.used = true;
  entry.usedBy = apiKey;
  entry.usedAt = Date.now();

  await saveRegistry(kv, registry);
  await saveCodes(kv, codes);
  return { ok: true, credited: entry.credits, newBalance: tenant.credits };
}

// Dormant Stripe wiring — kept for when real billing is re-enabled.
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

function isTenantActive(tenant) {
  return !!tenant && tenant.status !== 'suspended';
}

module.exports = {
  SIGNUP_CREDITS, CREDIT_COSTS,
  isTenantActive,
  createTenant, getTenantByApiKey, adjustCredits,
  generateRedemptionCode, redeemCode,
  linkStripeCustomer, updateTenantByStripeCustomer,
  genApiKey, genTenantId, genRedemptionCode,
};
