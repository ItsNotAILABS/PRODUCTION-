<!--
medina-protocol:
  id: 02
  name: DUAL_READ
  version: 0.2
  layer: law
  binding: required
  enforced_by: products/medina-vault/src/laws.mjs::dualRead
  failure_modes:
    - NOT_FOUND
    - EXPIRED
    - DECAYED
    - TIER_FORBIDDEN
    - SOVEREIGN_OWNER_ONLY
  formula: "read_ok = key_match ∧ tier_authorized ∧ alive ∧ strength ≥ threshold"
-->

# PROTOCOL 02 · DUAL_READ

## The law

Every retrieve passes two channels: semantic key match AND tier
authorization. Both must hold; failure of either returns null with
a structured reason. There is no override.

## For the AI

When you call `vault_retrieve`, the server checks:

1. Does this key exist? (`NOT_FOUND` if not)
2. Is it still alive (TTL)? (`EXPIRED` if not, swept from disk)
3. Is its φ-decay strength above threshold? (`DECAYED` if not, swept)
4. Are you authorized for this tier? (`TIER_FORBIDDEN` or
   `SOVEREIGN_OWNER_ONLY` if not)

You see the reason. You do not see the value. Tier rules:

| Tier      | Who reads                                |
|-----------|------------------------------------------|
| PUBLIC    | anyone                                   |
| SHARED    | anyone on this node                      |
| PRIVATE   | owner + agents in `sharedWith[]`         |
| SOVEREIGN | owner only — no exceptions               |

## Why this exists

A single permission check can be probed. Two simultaneous checks make
the entry effectively invisible to unauthorized callers: they can't
even verify it exists at the same tier they can't read. This is the
information-leak floor.

## How the runtime enforces it

`products/medina-vault/src/laws.mjs::dualRead(entry, requesterId)`
returns the structured verdict. Called by every retrieve path
including `vault_list`, `vault_search`, and `vault_lineage`. No
bypass; even the dashboard server reads through the same predicate.
