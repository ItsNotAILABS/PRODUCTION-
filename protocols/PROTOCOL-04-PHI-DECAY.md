<!--
medina-protocol:
  id: 04
  name: PHI_DECAY
  version: 0.2
  layer: law
  binding: required
  enforced_by: products/medina-vault/src/laws.mjs::{strength,DECAY_RATE,DECAY_THRESHOLD}
  formula: "strength(entry, t) = exp(-decayRate · ageHours)"
  decay_rates: { PUBLIC: 0.05, SHARED: 0.02, PRIVATE: 0.01, SOVEREIGN: 0.00 }
  threshold: 0.05
-->

# PROTOCOL 04 · PHI_DECAY

## The law

Memory ages. Strength at time *t* is `exp(−λ · ageHours)`. The decay
rate λ is fixed by tier identity, not chosen per entry:

```
PUBLIC     λ = 0.05/h    gone in ~60h
SHARED     λ = 0.02/h    gone in ~150h
PRIVATE    λ = 0.01/h    gone in ~300h
SOVEREIGN  λ = 0         eternal
```

Below `strength < 0.05` the entry is removed on next read or sweep.

## For the AI

You cannot make an entry last by lying about its decay rate. The
only way to extend memory life is `vault_promote` to a higher tier
(which is owner-only). Pick the right tier on write — the right
λ comes with it.

If you want to save something forever: SOVEREIGN. If you want it for
a month: PRIVATE. If you want it for a week: SHARED. If you want it
for a day: PUBLIC.

## Why this exists

Eternal memory is a worse problem than no memory. Without decay,
every cache becomes a permanent commitment. With tier-fixed decay,
the *act of writing at a tier* encodes how long the operator wants
the memory to live — without anyone having to think about TTL.

Anchored to φ harmonics because the rest of the runtime is.
Consistency is the moat (see PROTOCOL_09 on tokens).

## How the runtime enforces it

`laws.mjs::strength(entry, now)` computes `exp(−rate · ageHours)`.
`vault.mjs::retrieve` swept entries below threshold from disk on
read; `vault.mjs::sweep` does the same proactively on a schedule.
The dashboard filters entries below threshold out of its display.
