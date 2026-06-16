# MEDINA-PROTOCOL/0.1 — Vault Conformance

## LAYER 1 — MEANING (Doctrine Clause)

A Medina-conformant local memory node holds a sovereign vault for an
operator and the AIs that work on their behalf. The vault is not a
key-value store. It is a four-tier authority space governed at the
runtime layer by three laws that cannot be bypassed by call shape:

1. **RECITAL_PLUS_ONE** — every write must reference the validated
   prior state of its key. No jumps, no fabricated continuity.
   `state(n+1) = recital(validated(state_n)) + one_lawful_expansion`
2. **DUAL_READ** — every retrieve passes two channels: the semantic
   key match AND the tier authorization. Failure of either returns
   null. There is no override.
3. **φ-DECAY** — memory strength = `e^(−λ·ageHours)`. Tier λ values
   are fixed by tier identity: PUBLIC 0.05, SHARED 0.02, PRIVATE 0.01,
   SOVEREIGN 0.0. Below `DECAY_THRESHOLD = 0.05` the entry is gone.

## LAYER 2 — MODEL (Typed Schema)

```
Tier         = PUBLIC | SHARED | PRIVATE | SOVEREIGN
Entry        = { key, value, tier, ownerId, lineage[], createdAt,
                 expiresAt, decayRate, recital_prior_hash, metadata }
WriteRequest = { key, value, tier, ownerId, prior_hash? }
ReadRequest  = { key, requesterId }
Response     = { ok, entry? | reason?, lineage_depth, strength }
```

`recital_prior_hash` MUST be present on writes that update an existing
key. The first write of a key is the genesis recital — `prior_hash` is
the empty hash. Every subsequent write recites: it verifies the prior
hash matches the current head, then writes the next state. Mismatched
recital = REJECTED. This is what makes the lineage unbroken.

## LAYER 3 — COMPUTATION (State Equations)

```
strength(entry, t)   = exp(−entry.decayRate · ((t − createdAt)/3600000))
authorized(req, e)   = e.tier == PUBLIC
                     ∨ e.tier == SHARED
                     ∨ (e.tier == PRIVATE  ∧ (req == e.ownerId ∨ req ∈ e.sharedWith))
                     ∨ (e.tier == SOVEREIGN ∧ req == e.ownerId)
recital_ok(w, head)  = (head == null ∧ w.prior_hash == EMPTY)
                     ∨ (head ≠ null ∧ w.prior_hash == hash(head))
ttl_alive(entry, t)  = t ≤ entry.expiresAt
read_ok(req, e, t)   = ttl_alive(e, t) ∧ authorized(req, e)
                     ∧ strength(e, t) ≥ DECAY_THRESHOLD
```

## LAYER 4 — EXECUTION BINDING

- **ENGINE:** `team-vault@1.0.0` (MIT) — the verified primitive.
- **TRANSPORT:** Model Context Protocol (MCP) over stdio. Compatible
  with Claude Desktop, Cursor, Cline, Continue, Zed.
- **TOOLS EXPOSED:** `vault_store`, `vault_retrieve`, `vault_share`,
  `vault_promote`, `vault_list`, `vault_sweep`, `vault_status`.
- **PERSISTENCE:** JSON snapshot file. Atomic write-rename. One file
  per operator. Default: `~/.medina/vault.json`.
- **GATE:** every tool call passes through `recital()` + `dual_read()`
  middleware. There is no bypass path. Laws are runtime, not docs.
- **UPGRADE PATH:** any compliant node may advertise upgrade tools
  that delegate reads to `medina-memory-sdk` (φ-spatial Memory Palace,
  Fibonacci-anchored Temporal Memory, Schumann-locked Harmonic Compute).
  The free vault is the entry node. The depth resonates outward.

## ATTRIBUTION

Architecture: Alfredo Medina Hernandez.
This conformance document is itself a 4-layer artifact under
RECITAL_PLUS_ONE. Any extension must recite this document plus one
lawful expansion.
