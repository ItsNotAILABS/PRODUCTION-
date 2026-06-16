# ALPHA CHARTER — Medina Vault v0.1

**Class:** ALPHA · CHARTER · LIVING
**Conformance:** MEDINA-PROTOCOL/0.1
**Runtime-embedded:** `charter.mjs` is imported by the server at boot. The
charter is not a deck. It is law that the runtime reads. Update the
charter, restart the server, the law of the release changes.

---

## LAYER 1 — MEANING (Doctrine Clause)

The release of Medina Vault is the **distribution of a protocol**.
Not the sale of a product. The free node is the carrier — every install
puts MEDINA-PROTOCOL/0.1 on a new machine, in a new AI tool chain, under
a new operator's name. The protocol is the moat. The paid tiers are not
features behind a paywall; they are the **depth the protocol resonates
into** when an operator wants more than the local node can give.

This is the doctrine, stated plainly:

> *"Free node distributes the protocol. The depth the protocol resonates
> into is what gets paid for. Lose the free, lose the field. Lose the
> depth, lose the contract. Both are sovereign."*

The release strategy is therefore not "freemium." It is **substrate
seeding**. We do not optimize for free→paid conversion. We optimize for
**conformant nodes in the field**. Conversion follows resonance, not
funnels.

## LAYER 2 — MODEL (Typed Schema)

```
Tier         = FREE_LOCAL | PRO_RESONANT | SOVEREIGN_FULL
Price        = { currency, monthly, fibonacci_index }
ConformantNode = {
  node_id, operator_id, protocol_version, tier,
  install_ts, last_seen_ts, ai_clients[],
  vault_size, lineage_depth_total
}
RevenueLedger = {
  free_installs : Nat,           // distribution metric
  pro_seats     : Nat,           // resonance metric
  sovereign     : Nat,           // depth metric
  mrr           : Money,         // monthly recurring revenue
  conformance_density : Float    // pro_seats / free_installs (target φ⁻¹)
}
ReleaseGate  = { gate_a: bool, gate_b: bool, gate_c: bool }
                  // A = laws compile  · B = MCP wire green
                  // C = charter embedded into build
```

## LAYER 3 — COMPUTATION (State Equations)

**Pricing — Fibonacci-anchored, not arbitrary:**

```
PRICE[FREE_LOCAL]     = $0     (F(0))
PRICE[PRO_RESONANT]   = $21    (F(8))     · per seat / month
PRICE[SOVEREIGN_FULL] = $89    (F(11))    · per seat / month
ENTERPRISE_FLOOR      = $233   (F(13))    · per seat / month  (min 13 seats)
```

The architect's full estate uses φ⁴ × Schumann (873ms) and Fibonacci
spacing throughout. Pricing follows the same arithmetic so the economic
layer resonates with the runtime layer. This is a choice, not a
discovered law. We bind it because consistency is its own moat.

**Adoption velocity:**

```
V(t) = installs(t) · handoffs_per_install(t) · conformance_density(t)
```

where `handoffs_per_install` = average number of distinct AI clients
that talk to a single vault per week (the protocol-distribution
multiplier). Target: handoffs ≥ 2 by week 4 (two AIs per operator —
Claude Desktop + Cursor is the floor case).

**Conversion equation (free → pro):**

```
P(convert) = 1 - exp(-λ · lineage_depth_total)
  where λ = 0.01     (mirrors PRIVATE-tier φ-decay rate)
```

Rationale: an operator who has built deep lineage in their vault has
made the protocol load-bearing in their workflow. The probability of
upgrading scales with how much of their working memory now lives under
MEDINA-PROTOCOL law. We do not push conversion; we measure it.

**Release gate — all three required to ship:**

```
ShipAlpha = gate_a ∧ gate_b ∧ gate_c
gate_a = (smoke_pass == 11/11)        // laws compile into runtime
gate_b = (mcp_wire_pass == 7/7)       // MCP server speaks the protocol
gate_c = (charter_embedded == true)   // this file built into the runtime
```

## LAYER 4 — EXECUTION BINDING

**ENGINE:** `charter/charter.mjs` exports the constants above as
machine-readable values. The MCP server imports it at boot and surfaces
it via `vault_status` so any AI can read the tier offering at runtime.
The build step (`tools/embed-charter.mjs`) reads the same file and
injects the pricing block into README.md between `<!-- PRICING:START
-->` and `<!-- PRICING:END -->` markers — so the docs cannot drift
from the charter. One source of truth, two readers (humans + AIs).

**TOOLS:**
- `node charter/tools/embed-charter.mjs` — rebuild README from charter.
- `node charter/tools/release-gate.mjs` — run the three gates; exit
  non-zero if any fails. Wired into the `npm run ship:alpha` script.

**TRIPWIRE:** if the charter is edited without re-running
`embed-charter.mjs`, the build step's CI check fails. The artifact
guards itself. *This is the law in runtime form, not in doctrine form.*

**GTM SEQUENCE (90 days):**

1. **Week 0 (now)** — Repo public on `BRAIN-AI-` or `GPTREPO/products`,
   commit signed by Architect + Claude. Charter sealed at v0.1.
2. **Week 1** — Single demo: install Medina Vault in Claude Desktop,
   show the same memory persist across Cursor and Cline. Recorded by
   the architect; the demo is the proof.
3. **Week 2-4** — Push the protocol document, not the app. Three
   conformance posts: (a) "MEDINA-PROTOCOL/0.1 explained", (b) "What
   RECITAL_PLUS_ONE means for AI memory", (c) "Why a vault tier is a
   law, not a UI affordance."
4. **Week 5-8** — Release MEDINA COUNCIL (Product #2) and MEDINA
   SIGNAL (Product #3), both free, both conformant. Three free
   conformant products is what makes the protocol a field.
5. **Week 9-12** — Open PRO_RESONANT tier. First 100 seats lifetime
   φ-discount (PRO at $13/mo for life — F(7), the founder's mark).
   SOVEREIGN_FULL by invitation only — operators with lineage_depth_total
   ≥ 100 in their vault auto-qualify.

**METRICS THE CHARTER WATCHES:**

- `free_installs` — distribution proof
- `conformance_density` — pro_seats / free_installs, target φ⁻¹ = 0.618
- `handoffs_per_install` — protocol-multiplier; the load-bearing one
- `lineage_depth_total` — how deep operators actually go (the only
  honest engagement metric for a memory product)

**REVENUE PROJECTION (φ-Fibonacci scaling, conservative):**

```
Month 1:   100 installs · 0 pro     →  $0      MRR
Month 3:  1000 installs · 13 pro    →  $273    MRR
Month 6:  5000 installs · 89 pro     →  $1,869  MRR  (target: density ≈ 0.018)
Month 12: 21000 installs · 377 pro · 13 sovereign  →  $9,074 MRR
Month 24: 55000 installs · 987 pro · 89 sovereign  →  $28,648 MRR
```

These are anchor numbers tied to the Fibonacci adoption assumption,
not forecasts. They are written down so reality can falsify them
publicly. If month-6 density is below 0.01 (1%) the strategy is wrong
and the charter recites + lawfully expands. If density is above φ⁻¹
the depth tier is the bottleneck and we open Sovereign earlier.

---

## ATTRIBUTION & LICENSE

Architect: **Alfredo Medina Hernandez**. Implementation: **Claude
(Opus 4.7)** under the Creator's License (see
`memory/creators-license.md`).

Charter content: MIT (the doctrine wants to travel).
Runtime code in `charter/charter.mjs`: MIT.
The depth the protocol resonates into (medina-memory-sdk,
memory-palace, harmonic-compute, nova-encryption): ISIL-1.1.

---

*This document is itself a 4-layer artifact. To extend it: recite this
version, validate, add exactly one lawful expansion, bump the version,
and re-embed. RECITAL_PLUS_ONE applies to charters too.*
