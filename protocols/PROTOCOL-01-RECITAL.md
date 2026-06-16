<!--
medina-protocol:
  id: 01
  name: RECITAL_PLUS_ONE
  version: 0.2
  layer: law
  binding: required
  enforced_by: products/medina-vault/src/laws.mjs::recital
  failure_modes:
    - RECITAL_MISMATCH
    - PRIOR_HASH_REQUIRED_FOR_NON_OWNER
    - GENESIS_EXPECTED_EMPTY_PRIOR
  formula: "state(n+1) = recital(validated(state_n)) + one_lawful_expansion"
-->

# PROTOCOL 01 · RECITAL_PLUS_ONE

## The law

`state(n+1) = recital(validated(state_n)) + one_lawful_expansion`

Every write to an existing key must witness the prior state's hash.
No jumps. No fabricated continuity. The lineage is unbroken or the
write is rejected.

## For the AI

When updating a key you've already written:

1. Call `vault_retrieve` first. Take the `head_hash` from the response.
2. Call `vault_store` with that `head_hash` as `prior_hash`.
3. If you skip step 1 and pass a stale hash, the server returns
   `{ok: false, reason: "RECITAL_MISMATCH"}`. This is not punishment —
   it's the protocol catching you in the act of fabricating continuity
   so you can do it right.
4. If you're the owner, you may omit `prior_hash` on update and the
   vault auto-recites. Other agents must witness.

## Why this exists

Language models are fluent, which makes them confidently wrong. The
anti-hallucination problem at the memory layer is "AI thinks it
remembers a different prior." RECITAL_PLUS_ONE solves this at the
wire level: you cannot fake the prior because the hash check is
deterministic. Lying is impossible; you can only retrieve and witness.

## How the runtime enforces it

`products/medina-vault/src/laws.mjs::recital(request, currentHead)`
returns `{ok: false, reason: "RECITAL_MISMATCH"}` when
`request.prior_hash !== hashEntry(currentHead)`. The store path in
`vault.mjs` calls this before touching state. No bypass.
