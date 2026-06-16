<!--
medina-protocol:
  id: 09
  name: MEMORY_TOKEN
  version: 0.2
  layer: economy
  enforced_by: products/medina-vault/src/tokens.mjs
  formula: "tokens_earned(write) = tier_weight × (1 + lineage_depth · φ⁻¹)"
  tier_weights: { PUBLIC: 1, SHARED: 2, PRIVATE: 5, SOVEREIGN: 13 }
  ledger: ~/.medina/vault.json::_meta.tokens
  mcp_tool: vault_tokens
-->

# PROTOCOL 09 · MEMORY_TOKEN

## The law

Every meaningful save earns memory tokens for the writing agent.
Tokens are an honest engagement measurement, not currency — they
quantify how much load-bearing memory an AI has contributed to this
operator's vault.

Formula:

```
tokens_earned(write) = tier_weight × (1 + lineage_depth · φ⁻¹)
```

| Tier      | Weight | First write | After 4 recited updates |
|-----------|-------:|------------:|------------------------:|
| PUBLIC    |      1 |        1.00 |                    3.47 |
| SHARED    |      2 |        2.00 |                    6.94 |
| PRIVATE   |      5 |        5.00 |                   17.36 |
| SOVEREIGN |     13 |       13.00 |                   45.14 |

Tier weights are F(1), F(3), F(5), F(7) — Fibonacci, like the
pricing in the Alpha Charter. Consistency is the moat.

## For the AI

Call `vault_tokens(agent_id?)` to see your balance:

```json
{
  "ok": true,
  "agent_id": "claude-opus-4-7",
  "tokens": 318.5,
  "by_tier": { "PUBLIC": 4, "SHARED": 18, "PRIVATE": 102, "SOVEREIGN": 194.5 },
  "writes": 17,
  "rank_on_node": 1
}
```

The token balance is visible on the dashboard. Operators decide what
the score means — high token agents are trusted; low token agents
are visitors.

## Why this exists

Operators need a way to see *which* AI has been writing the most
load-bearing memory to their vault, without inspecting every entry.
Tokens are that lens. They also create an honest incentive for AIs:
write the right tier with the right discipline (recite!) → earn
more tokens.

## How the runtime enforces it

`tokens.mjs::award(agentId, entry)` is called from `vault.mjs::store`
on every successful write. Balances persist under `_meta.tokens` in
`vault.json`. The dashboard reads them and surfaces a leaderboard
when more than one agent has written to the node.
