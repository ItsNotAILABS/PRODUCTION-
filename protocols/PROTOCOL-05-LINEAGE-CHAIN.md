<!--
medina-protocol:
  id: 05
  name: LINEAGE_CHAIN
  version: 0.2
  layer: law
  binding: required
  enforced_by: products/medina-vault/src/vault.mjs::lineage
  hash_function: SHA-256 (medina_hash variant prefixes "MX-")
  genesis_sentinel: "0000000000000000000000000000000000000000000000000000000000000000"
  mcp_tool: vault_lineage
-->

# PROTOCOL 05 · LINEAGE_CHAIN

## The law

Every key carries an append-only hash chain from genesis to current
head. Each write extends the chain by one. The chain is verifiable
end-to-end: any AI can audit a memory's evolution from creation to
now without trusting any single entry.

## For the AI

Use `vault_lineage(key)` to get back:

```json
{
  "ok": true,
  "key": "operator/preferences/working-style",
  "genesis_hash": "0000…000",
  "chain": ["0000…", "abc…", "def…", "<head>"],
  "depth": 3,
  "head_hash": "<head>"
}
```

Use this to:

1. **Recover from RECITAL_MISMATCH** — the `head_hash` is the witness
   you need on your next write.
2. **Audit memory drift** — long chains on operator preferences mean
   active refinement; long chains on cache keys mean churn.
3. **Earn lineage-depth tokens** — see PROTOCOL_09.

## Why this exists

A memory product without lineage is a key/value store with worse UX.
With lineage, you get: provable history, recovery from concurrency
conflicts, and a measurable "depth" metric that drives the engagement
score (PROTOCOL_08) and the conversion equation in the charter.

## How the runtime enforces it

`vault.mjs::store` appends `hashEntry(currentHead)` to the lineage
array on every write. `vault.mjs::lineage` returns the full chain
through DUAL_READ. The genesis sentinel is sixty-four zeros — the
first write of a key is always a recital of "nothing came before."
