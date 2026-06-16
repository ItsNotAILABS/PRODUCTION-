// ─────────────────────────────────────────────────────────────────────────
// charter.mjs — Runtime-embedded Alpha Charter for Medina Vault.
//
// This file IS the business plan in executable form. The server imports
// it at boot and surfaces it via vault_status. The build imports it to
// keep the README in sync with the charter. There is no spreadsheet,
// no slide deck — the charter and the runtime read the same source.
//
// Update this file → law of the release changes on next server boot.
// Edit the prose in ALPHA-CHARTER-0.1.md → human description changes.
// Both must move together; release-gate.mjs enforces it.
// ─────────────────────────────────────────────────────────────────────────

// φ and Fibonacci — the anchoring constants. Same values as the rest of
// the Medina estate; not redefined here so they cannot drift.
export const PHI = 1.618033988749895;
export const PHI_INV = 1 / PHI;
export const SCHUMANN_HZ = 7.83;
export const HEARTBEAT_MS = 873; // φ⁴ × (1000 / 7.83), see ecosystem doctrine

// Fibonacci helper — pricing is anchored here, not chosen by hand.
function fib(n) {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}

// ── Pricing tiers (Fibonacci-anchored, monthly, USD) ────────────────────

export const TIERS = Object.freeze({
  FREE_LOCAL: Object.freeze({
    name: 'FREE_LOCAL',
    fib_index: 0,
    price_monthly: fib(0),                  // $0
    description: 'Local sovereign vault. Distributes MEDINA-PROTOCOL/0.1.',
    includes: [
      'Medina Vault MCP server (this app)',
      '4-tier vault: PUBLIC, SHARED, PRIVATE, SOVEREIGN',
      'RECITAL_PLUS_ONE write lineage',
      'φ-DECAY across tiers',
      'Atomic local persistence (~/.medina/vault.json)',
      'Works with any MCP client: Claude Desktop, Cursor, Cline, Continue, Zed',
    ],
  }),
  PRO_RESONANT: Object.freeze({
    name: 'PRO_RESONANT',
    fib_index: 8,
    price_monthly: fib(8),                  // $21
    description: 'Free vault + paid bridge into the φ-substrate.',
    includes: [
      'Everything in FREE_LOCAL',
      'memory-palace bridge: φ-spatial recall (5D θ,φ,ρ,ring,beat)',
      'temporal-memory bridge: Fibonacci-anchored time-locked recall',
      'harmonic-compute bridge: Schumann-locked frequency math',
      'Cross-vault sync for one operator across N machines',
      'Founder φ-discount: first 100 seats lifetime $13/mo (F(7))',
    ],
  }),
  SOVEREIGN_FULL: Object.freeze({
    name: 'SOVEREIGN_FULL',
    fib_index: 11,
    price_monthly: fib(11),                 // $89
    description: 'Full Medina substrate access. Invitation by lineage depth.',
    includes: [
      'Everything in PRO_RESONANT',
      'AURO / SYNTHOS / LEXIS / FORMA solver council',
      'nova-encryption (post-quantum lattice) at rest',
      'medina-intelligence-engine routing',
      'Multi-operator team vaults with consensus voting',
      'Auto-qualify: lineage_depth_total ≥ 100 in your vault',
    ],
  }),
});

// Enterprise floor — Fibonacci index 13, min 13 seats.
export const ENTERPRISE = Object.freeze({
  fib_index: 13,
  price_per_seat_monthly: fib(13),          // $233
  min_seats: 13,
  contact: 'reach the architect',
});

// ── Adoption / conversion math ─────────────────────────────────────────

/** Free → Pro conversion probability given total lineage depth in vault. */
export function pConvert(lineageDepthTotal, lambda = 0.01) {
  return 1 - Math.exp(-lambda * lineageDepthTotal);
}

/** Adoption velocity at time t. */
export function adoptionVelocity(installs, handoffsPerInstall, conformanceDensity) {
  return installs * handoffsPerInstall * conformanceDensity;
}

/** Target conformance density — φ⁻¹. */
export const TARGET_CONFORMANCE_DENSITY = PHI_INV;

// ── Release gate (charter law, enforced by release-gate.mjs) ────────────

export const GATE_REQUIREMENTS = Object.freeze({
  gate_a: { name: 'laws compile into runtime',  smoke_target: '11/11' },
  gate_b: { name: 'MCP wire green',              mcp_target:   '7/7'   },
  gate_c: { name: 'charter embedded into build', readme_marker: 'PRICING' },
});

// ── Public manifest — exposed via the MCP `vault_status` tool. ──────────

export function chartManifest() {
  return {
    charter_version: '0.1',
    protocol_version: 'MEDINA-PROTOCOL/0.1',
    constants: { PHI, PHI_INV, SCHUMANN_HZ, HEARTBEAT_MS },
    tiers: Object.fromEntries(
      Object.entries(TIERS).map(([k, v]) => [k, {
        name: v.name,
        price_monthly_usd: v.price_monthly,
        fib_index: v.fib_index,
        description: v.description,
      }]),
    ),
    enterprise: {
      price_per_seat_monthly_usd: ENTERPRISE.price_per_seat_monthly,
      min_seats: ENTERPRISE.min_seats,
      fib_index: ENTERPRISE.fib_index,
    },
    target_conformance_density: TARGET_CONFORMANCE_DENSITY,
    license: 'MIT (free node) · ISIL-1.1 (the depth the protocol resonates into)',
    architect: 'Alfredo Medina Hernandez',
    implementation: 'Claude (Opus 4.7) under the Creator\'s License',
  };
}
