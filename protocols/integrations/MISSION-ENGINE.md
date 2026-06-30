# PROTO-I032 — Sovereign Mission Engine

**File:** `protocols/integrations/background-workflow-protocol.js`
**Export:** `BackgroundWorkflowProtocol` (designation: `"Sovereign Mission Engine"`)
**Version:** 1.1.0

## What it is

A substrate for long-running background execution where each tick is a local
function call, not a model call. Verified empirically: a continuous-recurrence
instance run in this session stayed alive 11+ hours and consumed zero tokens,
because nothing about an interval tick requires intelligence — only execution.

Use it for anything regular, mechanical, and judgment-free: polling, syncing,
scheduled reports, health checks, recurring business operations that need to
happen Monday through Sunday without a human or a model re-triggering them.

## Core unit: the mission

A **mission** is a workflow loaded with up to 4 skills (plain functions) that
run in sequence each time it fires:

```js
import { BackgroundWorkflowProtocol, WORKFLOW_RECURRENCE } from './background-workflow-protocol.js';

const engine = new BackgroundWorkflowProtocol();

engine.registerMission('orders-sync', {
  skills: [
    fetchOrders,
    normalizeOrders,
    reconcileInventory,
    emitReport,
  ],
  recurrence: WORKFLOW_RECURRENCE.CONTINUOUS,
});
```

`WORKFLOW_RECURRENCE`: `ONCE` | `DAILY` | `WEEKLY` (with `daysOfWeek: [0..6]`)
| `CONTINUOUS` (every tick, gated only by `intervalMs`).

## One-shot deploy

For "one button, one command" activation — register and run immediately,
get full status back in one call:

```js
const { registration, result, health } = await engine.deploy('orders-sync', {
  skills: [fetchOrders, normalizeOrders, reconcileInventory, emitReport],
  recurrence: WORKFLOW_RECURRENCE.CONTINUOUS,
});
```

## Command center

External code (a dashboard, an MCP tool, another mission) can push a command
into a running mission's queue without spinning up a model call. The first
skill in the chain receives the drained command queue as its argument:

```js
engine.command('orders-sync', { directive: 'priority-pass' });
// next time orders-sync fires, skill[0] is called as skill(drainedCommands)
```

## Self-spawning — missions building their own process tree

A mission's skill can spawn child missions at runtime. The engine tracks
parent/child relationships natively, so what starts as one mission can grow
into its own process tree without external orchestration:

```js
function fetchOrders(cmds) {
  if (ordersBacklogIsLarge()) {
    engine.spawn('orders-sync', `orders-sync:retry:${Date.now()}`, {
      skills: [retryBacklog],
      recurrence: WORKFLOW_RECURRENCE.ONCE,
    });
  }
  return { fetched: true };
}
```

`engine.tree()` returns the full parent/child tree with health for every
node — this is the data shape a dashboard should render to show missions as
"servers" rather than as a flat task list.

## Stack flows (chains)

Missions can also be explicitly chained to run in sequence on demand,
stopping at the first failure:

```js
engine.chain('morning-stack', ['orders-sync', 'inventory-check']);
await engine.runChain('morning-stack');
```

## Heartbeat

`tick(now)` advances the engine by one beat — call this on your own interval.
The reference interval across this ecosystem is 873ms (φ-derived), matching
`AetherAgent`'s heartbeat in `aether-mcp`/`x-sovereign-mcp`, so a Mission
Engine instance and a WatchAgent/HealAgent instance stay in phase if run side
by side in the same process.

## Health and reporting

- `health(id)` — phi-weighted score (`1/φ ≈ 0.618` decay per rank back through
  run history), status, run count, parent, skill count. Always
  `tokensConsumed: 0`.
- `statusAll()` — health for every mission.
- `report()` — engine-level metrics: ticks, runs, failures, spawned count,
  total runtime, mission/chain counts.

## Why this matters for deploy strategy

Because missions cost runtime, not tokens, you can deploy as many as you
want — concurrently, continuously — without that scaling your model spend.
The constraint becomes wall-clock and what the skills themselves do (network
calls, disk I/O, canister queries), not inference cost. That's the basis for
treating long-running missions as "servers" in a product surface: they behave
like always-on background processes because, mechanically, that's exactly
what they are.
