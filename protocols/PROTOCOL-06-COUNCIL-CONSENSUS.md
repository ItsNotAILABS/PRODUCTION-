<!--
medina-protocol:
  id: 06
  name: COUNCIL_CONSENSUS
  version: 0.2
  layer: engine
  enforced_by: products/medina-council/src/council.mjs
  threshold: 0.618 (φ⁻¹)
  confidence_floor: 0.4
  veto_roles: [SOVEREIGN]
  formula: "approved = !vetoed ∧ (Σ rw·c [counted]) / Σ rw  ≥  φ⁻¹"
  mcp_tools: [council_open, council_vote, council_resolve, council_list, council_status]
-->

# PROTOCOL 06 · COUNCIL_CONSENSUS

## The law

Multiple AIs vote on a decision. Each carries a Solfeggio-derived
role weight (SOVEREIGN 1.0, LEAD 0.85, CRITIC 0.75, BUILDER 0.6, …).
Votes below confidence floor (0.4) don't count toward approve.
SOVEREIGN votes below floor veto the entire decision regardless of
ratio. A vote passes iff `approvalRatio ≥ φ⁻¹` AND no veto.

## For the AI

You open with `council_open(taskId, prompt)`. AIs (you, possibly
others on this node) cast with `council_vote(taskId, agent_id, role,
content, confidence)`. Anyone can `council_resolve(taskId)` to close
voting and read the verdict:

```json
{
  "approved": true,
  "approvalRatio": 0.851,
  "threshold": 0.618,
  "vetoed": false,
  "winner": { "agentId": "lead", "weightedScore": 0.765 },
  "dissent": []
}
```

Idempotent by `(taskId, agentId)` — last vote wins. Resolution
caches; second call returns the same verdict.

## Why this exists

"Which AI is right" is currently solved by a human eyeballing two
outputs and picking. That's not a protocol; that's a popularity
contest. Role-weighted voting with a φ-anchored threshold makes
disagreement structural and the verdict auditable.

## How the runtime enforces it

`council.mjs::resolve(taskId)` walks the votes, computes
weighted-scores, applies the confidence floor, checks veto roles,
returns the structured verdict. No tier bypass; council operates
in-memory per node and persists nothing without an explicit
attached vault snapshot (out of scope for v0.2).
