<!--
medina-protocol:
  id: 03
  name: TIER_AUTHORITY
  version: 0.2
  layer: law
  binding: required
  tiers: [PUBLIC, SHARED, PRIVATE, SOVEREIGN]
  order: privilege-ascending
  enforced_by: products/medina-vault/src/vault.mjs::{share,promote,store}
  failure_modes:
    - INVALID_TIER
    - SOVEREIGN_UNSHAREABLE
    - SHARE_REQUIRES_PRIVATE_TIER
    - NOT_A_PROMOTION
    - OWNER_ONLY
-->

# PROTOCOL 03 · TIER_AUTHORITY

## The law

The four tiers — PUBLIC, SHARED, PRIVATE, SOVEREIGN — are not labels.
They are authority bands. Each carries fixed visibility rules
(PROTOCOL_02), fixed decay rates (PROTOCOL_04), and fixed mutability
rules (here).

## For the AI

Pick the right tier on every write. The runtime enforces; you
shouldn't have to guess.

```
operator preferences       → SOVEREIGN
operator identity          → SOVEREIGN
session-specific facts     → PRIVATE
project state              → PRIVATE
team handoffs              → SHARED
findings other AIs benefit → SHARED
disposable scratch / cache → PUBLIC
build status / config      → PUBLIC
```

Rules of motion:

- `promote(key, newTier)` — owner only, must go strictly up.
- `demote(key, newTier)` — owner only, must go strictly down.
- `share(key, target)` — owner only, **only PRIVATE entries** can be shared.
- Promoting to SOVEREIGN clears `sharedWith[]` instantly. Past
  access is not memory of access.
- SOVEREIGN entries cannot be created with `sharedWith` set.

## Why this exists

A memory product without tier semantics is a database. Tier authority
turns it into a sovereign instrument: the operator's data has a
floor (SOVEREIGN) no AI can elevate itself into, and a ceiling
(PUBLIC) below which nothing is precious. AIs become tier-aware,
which is the closest a stateless model gets to discretion.

## How the runtime enforces it

`vault.mjs::store` reads the `tier` argument and applies the fixed
decay + TTL for that tier (`laws.mjs::DECAY_RATE`, `DEFAULT_TTL`).
SOVEREIGN-creation paths force `sharedWith = []`. `share()` and
`promote()` validate the tier transition before mutating state.
