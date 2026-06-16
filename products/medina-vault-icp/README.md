# Medina Vault — ICP canister

The vault running on the Internet Computer instead of your laptop.
Same protocol (`MEDINA-PROTOCOL/0.2`). Same four tiers. Same laws.
What changes: state lives on-chain (survives upgrades), callers
authenticate via their ICP Principal, and the vault is shareable
across machines.

## Prerequisites

- [`dfx`](https://internetcomputer.org/docs/current/developer-docs/setup/install/) installed (the IC SDK)
- Cycles for mainnet deploy (free for local)

## Deploy locally (no cycles needed)

```bash
cd products/medina-vault-icp
dfx start --background --clean
dfx deploy
```

The deploy prints a canister id like `bkyz2-fmaaa-aaaaa-qaaaq-cai`.
Call it from any IC client:

```bash
dfx canister call medina_vault status
# → (record { protocol = "MEDINA-PROTOCOL/0.2"; tier_counts = record { PUBLIC = 0; SHARED = 0; PRIVATE = 0; SOVEREIGN = 0; total = 0 } })

dfx canister call medina_vault store '(record {
  key       = "operator/identity";
  value     = "{\"name\":\"Alfredo Medina Hernandez\"}";
  tier      = variant { SOVEREIGN };
  priorHash = null
})'

dfx canister call medina_vault retrieve '("operator/identity")'
```

## Deploy to mainnet

```bash
dfx deploy --network ic
# Will prompt for cycles. ~1 T cycles bootstraps a canister.
```

## What's implemented

- Four tiers (PUBLIC / SHARED / PRIVATE / SOVEREIGN) with the same
  decay rates as the local vault.
- `store()` enforces RECITAL_PLUS_ONE; `retrieve()` enforces DUAL_READ.
- Verdicts are typed Motoko variants — callers pattern-match on the
  exact failure mode (`#recitalMismatch`, `#sovereignOwnerOnly`, …),
  same as the JSON failure reasons in the Node version.
- Stable memory preserves entries across canister upgrades
  (`preupgrade`/`postupgrade`).
- `status()` and `protocols()` query methods for orientation.

## What's still scaffolded (v0.2 → v0.3)

- `share()`, `promote()`, `demote()`, `lineage()` — straightforward
  ports of the Node implementations; not yet in this canister.
- Custos and tokens — live in the local vault for now; an on-chain
  Custos is a v0.3 protocol extension.
- vetKD / threshold-encryption integration for SOVEREIGN entries on
  mainnet (so the canister can't even read them in plaintext).

## How an MCP client talks to this canister

There's no MCP-over-ICP transport yet. The MCP server in
`products/medina-vault/src/server.mjs` can be configured to delegate
`vault_store`/`vault_retrieve` to this canister via the `@dfinity/agent`
HTTPS interface — that's the bridge that makes one operator's vault
visible from multiple machines. Tracking issue, not in this scaffold.

## License

MIT. Architecture: Alfredo Medina Hernandez. Implementation: Claude
Opus 4.7 under the Creator's License.
