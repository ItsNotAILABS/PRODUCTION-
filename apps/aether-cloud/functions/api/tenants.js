/**
 * Aether Cloud — tenant registry + internal credit economy.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure functions, no Request/Response. Storage in the AETHER_CLOUD_KV
 * namespace, ONE KEY PER TENANT and ONE KEY PER CODE:
 *
 *   tenant:<apiKey>       → the tenant record
 *   code:<code>           → a redemption code record
 *   stripecust:<custId>   → apiKey (dormant Stripe reverse index)
 *
 * This is the multi-user scaling change. The previous design kept every
 * tenant in a single "tenants" blob and every code in a single
 * "redemption_codes" blob, so every signup / credit spend / redemption
 * did a read-modify-write of ONE shared key — under real concurrency two
 * unrelated tenants acting at the same moment would clobber each other's
 * records (last write wins, the other's change lost). With per-key
 * storage, two different tenants NEVER touch the same KV key, so
 * cross-tenant contention is gone entirely and the system scales to as
 * many tenants as the KV namespace holds.
 *
 * Remaining honest caveat: a SINGLE tenant firing concurrent billable
 * requests still does read-modify-write on its own one key, so it can
 * still race with itself (KV has no compare-and-swap). The blast radius
 * is now one tenant's own balance rather than the whole registry, which
 * is acceptable for launch; the fix for true per-tenant atomicity is a
 * Durable Object per tenant (serializes writes per object). Documented in
 * README.md under "Concurrency model". Same applies to the redeem-code
 * used-flag check — flagged at redeemCode().
 *
 * MONETIZATION MODEL: internal credits, not live payment processing.
 * Every tenant gets a free signup grant; billable actions cost credits;
 * the operator hands out more via admin-generated redemption codes. No
 * external payment processor required to run the product.
 *
 * Stripe wiring is left in place but dormant — see functions/api/billing/*.
 */

'use strict';

const SIGNUP_CREDITS = 500;

const CREDIT_COSTS = {
  register_target: 50,
  deploy_protocol: 100,
  deploy_workload: 75,
};

const TENANT_PREFIX = 'tenant:';
const CODE_PREFIX = 'code:';
const STRIPE_PREFIX = 'stripecust:';

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

// ── Tenant CRUD (one key each) ──────────────────────────────────────────

async function createTenant(kv, { email, plan = 'trial' }) {
  const apiKey = genApiKey();
  const tenant = {
    tenantId: genTenantId(),
    email,
    plan,
    status: 'active',        // credits gate usage now, not subscription status
    credits: SIGNUP_CREDITS,
    stripeCustomerId: null,  // dormant — see file header
    stripeSubscriptionId: null,
    createdAt: Date.now(),
  };
  if (kv) await kv.put(TENANT_PREFIX + apiKey, JSON.stringify(tenant));
  return { apiKey, tenant };
}

async function getTenantByApiKey(kv, apiKey) {
  if (!apiKey || !kv) return null;
  return (await kv.get(TENANT_PREFIX + apiKey, 'json')) || null;
}

async function putTenant(kv, apiKey, tenant) {
  if (kv) await kv.put(TENANT_PREFIX + apiKey, JSON.stringify(tenant));
  return tenant;
}

async function adjustCredits(kv, apiKey, delta) {
  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return null;
  tenant.credits = Math.max(0, tenant.credits + delta);
  return putTenant(kv, apiKey, tenant);
}

// ── Redemption codes (one key each) ─────────────────────────────────────

async function generateRedemptionCode(kv, credits) {
  const code = genRedemptionCode();
  const entry = { credits, used: false, usedBy: null, createdAt: Date.now(), usedAt: null };
  if (kv) await kv.put(CODE_PREFIX + code, JSON.stringify(entry));
  return code;
}

async function redeemCode(kv, apiKey, code) {
  const entry = kv ? await kv.get(CODE_PREFIX + code, 'json') : null;
  if (!entry) return { ok: false, error: 'invalid_code' };
  if (entry.used) return { ok: false, error: 'code_already_used' };

  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return { ok: false, error: 'unknown_tenant' };

  // NOTE: check-then-set on the `used` flag is not atomic under KV. Two
  // simultaneous redemptions of the same code could both pass the
  // `entry.used` check. Blast radius is one code over-crediting one
  // tenant; acceptable at launch, needs a Durable Object for true
  // atomicity. Marking the code used FIRST (before crediting) narrows
  // the window but doesn't close it.
  entry.used = true;
  entry.usedBy = apiKey;
  entry.usedAt = Date.now();
  await kv.put(CODE_PREFIX + code, JSON.stringify(entry));

  tenant.credits += entry.credits;
  await putTenant(kv, apiKey, tenant);
  return { ok: true, credited: entry.credits, newBalance: tenant.credits };
}

// ── Operator metrics (admin dashboards) ─────────────────────────────────
// O(number of tenants) via KV list — for an operator overview, not a
// hot path. Fine at launch scale; if the tenant count grows into the
// thousands, maintain a running counter key instead of listing.

async function tenantStats(kv) {
  if (!kv || !kv.list) return { tenants: 0, totalCreditsOutstanding: 0 };
  let cursor;
  let tenants = 0;
  let totalCredits = 0;
  do {
    const page = await kv.list({ prefix: TENANT_PREFIX, cursor });
    for (const key of page.keys) {
      const t = await kv.get(key.name, 'json');
      if (t) {
        tenants += 1;
        totalCredits += t.credits || 0;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { tenants, totalCreditsOutstanding: totalCredits };
}

// ── Dormant Stripe wiring — kept for when real billing is re-enabled ────

async function linkStripeCustomer(kv, apiKey, stripeCustomerId) {
  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return null;
  tenant.stripeCustomerId = stripeCustomerId;
  await putTenant(kv, apiKey, tenant);
  if (kv) await kv.put(STRIPE_PREFIX + stripeCustomerId, apiKey);
  return tenant;
}

async function updateTenantByStripeCustomer(kv, stripeCustomerId, patch) {
  if (!kv) return null;
  const apiKey = await kv.get(STRIPE_PREFIX + stripeCustomerId);
  if (!apiKey) return null;
  const tenant = await getTenantByApiKey(kv, apiKey);
  if (!tenant) return null;
  Object.assign(tenant, patch);
  return putTenant(kv, apiKey, tenant);
}

function isTenantActive(tenant) {
  return !!tenant && tenant.status !== 'suspended';
}

module.exports = {
  SIGNUP_CREDITS, CREDIT_COSTS,
  TENANT_PREFIX, CODE_PREFIX, STRIPE_PREFIX,
  isTenantActive,
  createTenant, getTenantByApiKey, putTenant, adjustCredits,
  generateRedemptionCode, redeemCode, tenantStats,
  linkStripeCustomer, updateTenantByStripeCustomer,
  genApiKey, genTenantId, genRedemptionCode,
};
