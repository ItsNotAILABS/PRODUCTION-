<!--
medina-protocol:
  id: 10
  name: OPERATOR_IDENTITY
  version: 0.2
  layer: identity
  binding: required
  enforced_by: products/medina-vault/src/server.mjs::OPERATOR_ID resolution
  resolution_order:
    - env MEDINA_OPERATOR_ID
    - env USER
    - env USERNAME
    - literal "operator"
  default_principal: operator
-->

# PROTOCOL 10 · OPERATOR_IDENTITY

## The law

A Medina node serves exactly one operator. That operator's identity
governs SOVEREIGN access and is the default `agent_id` for any AI
that doesn't supply one. The operator owns the vault file. Period.

## For the AI

Find out who you're working for:

```
vault_status → { operator: "Medin", ... }
```

If you act on the operator's behalf and don't have a distinct agent
identity, you pass `agent_id: "<operator>"` and inherit SOVEREIGN
access. If you have your own identity (e.g., `claude-opus-4-7`),
you pass that and you're treated as a guest of the operator.

The operator is the one human who can:

- Read SOVEREIGN entries.
- Share PRIVATE entries.
- Promote any entry to any higher tier.
- Read every agent's token balance and engagement.

## Why this exists

A vault without a defined operator is a multi-tenant database, and
multi-tenant memory is a contradiction in terms (whose memory? for
whom?). One node, one operator, one sovereign identity. Multi-
operator vaults are a Pro tier feature, not a free-tier behavior.

## How the runtime enforces it

`server.mjs` resolves `OPERATOR_ID` at boot from `MEDINA_OPERATOR_ID`
env var, falling back to OS user. Every tool handler uses
`defaultRequester()` which returns the explicit `agent_id` if
provided or the operator id by default. SOVEREIGN tier checks
require `ownerId === requesterId`; only the operator can satisfy
this on their own entries.
