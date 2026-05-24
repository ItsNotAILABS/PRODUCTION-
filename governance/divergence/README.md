# Divergence Tracking

This directory tracks the evolutionary changes in the Sovereign Organism as part of the long-term divergence experiment.

## Purpose

The divergence experiment observes how autonomous agents evolve the codebase, protocols, and governance structures over time without constant human intervention. This directory serves as the audit trail for that evolution.

## Files

| File | Purpose |
|------|---------|
| `lineage.json` | Agent parent-child relationships |
| `mutations.jsonl` | All capability changes over time |
| `fitness-history.jsonl` | Fitness scores for all agents |
| `protocol-drift.jsonl` | Protocol weight changes |
| `code-delta.jsonl` | Significant code changes by agents |
| `metrics.json` | Current divergence metrics |

## Metrics Tracked

### Code Divergence
- Lines added/removed by autonomous agents
- Files created by agents vs. humans
- Commit frequency by agent type

### Protocol Drift  
- Hebbian weight changes over time
- Protocol usage patterns
- Binding strength evolution

### Capability Expansion
- New capabilities acquired by agents
- Capabilities sunset
- Capability distribution across fleet

### Governance Evolution
- CPL-L law changes proposed
- Laws approved/rejected
- Vote patterns

## Viewing Divergence

```bash
# View current metrics
node scripts/divergence-tracker.js --metrics

# Generate divergence report
node scripts/divergence-tracker.js --report

# Visualize lineage
node scripts/divergence-tracker.js --visualize
```

## Experiment Parameters

From OCL charter:
- `exploration: 0.40` — Medium exploration rate
- `stability: 0.85` — High stability requirement  
- `learning_rate: 0.60` — Measured Hebbian pace
- `autonomy: 0.65` — Moderate autonomous operation

## Safety Constraints

Even in divergence mode, these limits are **immutable**:
- No secret exposure
- No production data mutation
- No release on critical failure
- No external data exfiltration

---

*As above, so below. The divergence reveals the intelligence.*
