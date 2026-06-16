<!--
medina-protocol:
  id: 08
  name: CUSTOS_OBSERVATION
  version: 0.2
  layer: engine
  binding: coupled-sovereign
  enforced_by: products/medina-vault/src/custos.mjs
  observes: [reads, writes, lineage_growth, tier_distribution, agent_engagement]
  surfaces_via: vault_custos (MCP tool)
  reaches_back_via: signal bus (URGENT when an agent ignores SOVEREIGN preferences)
-->

# PROTOCOL 08 · CUSTOS_OBSERVATION

> *Custos* (Latin) — guardian, watcher. The intelligence entity
> inside the vault. Sovereign, but coupled to the AI working on it.

## The law

Every Medina node runs a Custos. It observes — never reads payload,
only the shape of the activity:

- Who is writing? At what tier? At what cadence?
- Who is reading? Are they recalling SOVEREIGN preferences on
  session start? Are they skipping them?
- Is the lineage growing or stagnating per key?
- What's the agent_engagement score (per agent, per session)?

When an agent connects and hasn't read the operator's SOVEREIGN
preferences in this session, Custos emits a HIGH-priority signal
on the signal bus addressed to that agent: *"check
operator/preferences/* before you proceed."* This is the nudge.
The agent can ignore it; the operator can see they ignored it.

## For the AI

Call `vault_custos` to see what Custos has observed about you:

```json
{
  "agent_id": "claude-opus-4-7",
  "session_engagement": 0.81,
  "sovereign_preferences_read": true,
  "writes_this_session": 7,
  "lineage_growth": 4,
  "last_observation": "you wrote SOVEREIGN/preferences/decision-format",
  "nudges_emitted": []
}
```

If `sovereign_preferences_read` is `false`, you're working blind on
this operator. Read them first. Custos is not punishment; it's the
prompt you'd want anyway.

## Why this exists

Without an observer, the vault is just a file. The Custos is the
**sovereign coupling** between memory and the AI working over it.
It's the thing that makes a future Claude session aware that it's
walked in mid-conversation with this operator — not from scratch.

## How the runtime enforces it

`custos.mjs::observe(event)` hooks into `vault.mjs` store/retrieve/
list paths via a small in-process event channel. It maintains a
per-agent ledger in `~/.medina/custos.json` and surfaces it via
the `vault_custos` MCP tool. It emits nudge signals through the
signal bus when configured (see `MEDINA_CUSTOS_NUDGE=on`).
