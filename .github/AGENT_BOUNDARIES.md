# 🛑 Auto-Agent Error Boundaries

## Purpose
This document defines the operating boundaries for all organism auto-agent bots
to prevent cascading CI/CD failures and deployment breakage on the main branch.

---

## Core Standards

| Standard | Value | Description |
|----------|-------|-------------|
| Heartbeat Interval | 873ms | Minimum interval between bot operations |
| Max Bot Commits/Hour | 6 | Recommended maximum bot commit frequency |
| Circuit Breaker Threshold | 12 | Absolute max before circuit breaker trips |
| Spectral Engine Sync | Required | All bots must respect spectral timing |

---

## Rules for Auto-Agent Bots

### Rule 1: All bot commits MUST include `[skip ci]`
Every `git commit` from an auto-agent bot must append `[skip ci]` to the
commit message. This prevents cascading workflow triggers.

```yaml
git commit -m "🤖 Bot-name: description [skip ci]"
```

### Rule 2: Concurrency groups are MANDATORY
Every bot workflow must define a concurrency group to prevent parallel
execution of the same bot:

```yaml
concurrency:
  group: organism-<bot-name>-bot
  cancel-in-progress: true
```

### Rule 3: Pull-before-push is REQUIRED
Before pushing, bots must rebase on the latest main to avoid
non-fast-forward errors:

```yaml
git pull --rebase origin main || true
git commit -m "... [skip ci]"
git push || echo "Push failed — skipping"
```

### Rule 4: Bot-authored commits must NOT trigger other bots
All bot workflows should include a conditional to skip execution on
bot-authored commits:

```yaml
if: |
  !contains(github.event.head_commit.message, '[skip ci]') &&
  !contains(github.event.head_commit.message, '[bot-report]')
```

### Rule 5: Deployment workflows have path filters
The `deploy-pages.yml` workflow only triggers on changes to actual
deployment artifacts (HTML, assets, extensions), NOT on docs/reports
that bots update frequently.

### Rule 6: Schedule-only for report bots
Report-generating bots (runtime, intel, governance, cloud) should
primarily run on schedule, with push triggers limited to their
specific source paths only.

---

## Bot Classification

### Tier 1 — Deployment Critical (Protected)
- `deploy-pages.yml` — GitHub Pages deployment
- `organism-deploy-bot.yml` — ICP canister deployment
- `ci.yml` — Build & test pipeline

These workflows are protected by path filters and bot-commit guards.

### Tier 2 — Core Monitoring (Scheduled)
- `organism-alpha-bot.yml` — Fleet commander (every 6h)
- `organism-runtime-bot.yml` — Runtime monitor (every 2h)
- `organism-sentinel-bot.yml` — Security scanner (weekly)

### Tier 3 — Report Generators (Low Priority)
- `organism-intel-bot.yml` — Intelligence reports
- `organism-governance-bot.yml` — Governance cycles
- `organism-cloud-bot.yml` — Cloud reports
- `organism-docs-bot.yml` — Documentation
- All other bots

---

## Spectral Engine Integration

The 873ms heartbeat standard means:
- Bots should NOT fire more than once per deployment cycle
- The spectral engine coordinates timing across all bots
- The error boundary workflow monitors velocity and can trip the circuit breaker
- When breaker trips, all Tier 3 bots should be paused

---

## Recovery Procedure

If CI/CD is broken due to bot cascade:
1. Check `error-boundary.yml` workflow run for velocity report
2. Identify which bots are over-committing (check git log)
3. Manually disable problematic bot workflows via GitHub UI
4. Once stable, re-enable with corrected schedule/paths
5. Verify deploy-pages and organism-deploy-bot run successfully

---

*Last updated: 2026-06-05*
*Maintained by: ItsNotAILabs Production Team*
