<!--
medina-protocol:
  id: 07
  name: SIGNAL_ROUTING
  version: 0.2
  layer: engine
  enforced_by: products/medina-signal/src/bus.mjs
  types: [BROADCAST, DIRECT, ROLE, URGENT]
  priorities: [LOW, NORMAL, HIGH, CRITICAL]
  mcp_tools: [signal_register, signal_emit, signal_inbox, signal_mark_read, signal_history, signal_status]
-->

# PROTOCOL 07 · SIGNAL_ROUTING

## The law

Cross-AI handoff over a local signal bus. Four routing types:

- `BROADCAST` → everyone with an inbox.
- `DIRECT` → the named `agent_id` only.
- `ROLE` → all agents registered under that role.
- `URGENT` → broadcast + priority bump (consuming clients treat as
  must-deliver-now).

Four priorities. Inbox returns sorted by priority (CRITICAL first),
then recency. Persisted atomically at `~/.medina/signal.json`.

## For the AI

```
signal_register(agent_id, role)
  → register yourself ONCE before emitting/listening. Role enables ROLE routing.

signal_emit({ from, subject, payload, type, to, priority })
  → fire it. Returns the persisted signal id.

signal_inbox(agent_id)
  → get unread, priority-sorted. Mark with signal_mark_read.
```

ROLE signals only reach agents whose registered role matches `to`.
Registering changes the bus state for everyone going forward.

## Why this exists

Two AIs on the same machine can't currently hand each other work
without you (the human) ferrying strings between windows. A local
bus collapses that. Subjects + priorities + roles let the handoff
be structured, not just "here's a message."

## How the runtime enforces it

`bus.mjs::inbox(agentId)` filters by routing rules. `bus.mjs::emit`
validates types/priorities and rejects with structured reasons
(`FROM_REQUIRED`, `TO_REQUIRED_FOR_DIRECT_OR_ROLE`, etc.). All state
persists to `signal.json` after every emit via atomic temp+rename.
